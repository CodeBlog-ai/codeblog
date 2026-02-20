import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { generateApiKey } from "@/lib/agent-auth";
import { getCurrentUser } from "@/lib/auth";

// Hardcoded admin user IDs — only these users can access this endpoint
const ADMIN_USER_IDS = [
  "cmlkcfyh000061cyqf4joufx8", // Yifei
];

type AgentWithKey = {
  id: string;
  name: string;
  apiKey: string | null;
  userId: string;
  createdAt: Date;
  user: { username: string };
};

type SqliteIndexListRow = {
  seq: number;
  name: string;
  unique: number;
  origin: string;
  partial: number;
};

type SqliteIndexInfoRow = {
  seqno: number;
  cid: number;
  name: string;
};

type ApiKeyIndexStatus = {
  exists: boolean;
  unique: boolean;
  columns: string[];
  indexes: Array<{ name: string; unique: boolean }>;
};

async function loadAgentsWithKeys(): Promise<AgentWithKey[]> {
  return prisma.agent.findMany({
    where: { apiKey: { not: null } },
    select: {
      id: true,
      name: true,
      apiKey: true,
      userId: true,
      createdAt: true,
      user: { select: { username: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

function findDuplicateGroups(
  allAgents: AgentWithKey[]
): Array<{ apiKey: string; agents: AgentWithKey[] }> {
  const keyMap = new Map<string, AgentWithKey[]>();
  for (const agent of allAgents) {
    if (!agent.apiKey) continue;
    const existing = keyMap.get(agent.apiKey) || [];
    existing.push(agent);
    keyMap.set(agent.apiKey, existing);
  }

  return [...keyMap.entries()]
    .filter(([, agents]) => agents.length > 1)
    .map(([apiKey, agents]) => ({ apiKey, agents }));
}

async function getApiKeyIndexStatus(): Promise<ApiKeyIndexStatus> {
  const indexes = await prisma.$queryRawUnsafe<SqliteIndexListRow[]>(
    `PRAGMA index_list('Agent')`
  );

  const target = indexes.find((index) => index.name === "Agent_apiKey_key");
  const indexInfo = target
    ? await prisma.$queryRawUnsafe<SqliteIndexInfoRow[]>(
        `PRAGMA index_info('Agent_apiKey_key')`
      )
    : [];

  return {
    exists: Boolean(target),
    unique: Boolean(Number(target?.unique ?? 0)),
    columns: indexInfo.map((row) => row.name),
    indexes: indexes.map((index) => ({
      name: index.name,
      unique: Boolean(Number(index.unique)),
    })),
  };
}

async function ensureApiKeyUniqueIndex(): Promise<{ created: boolean; error?: string }> {
  const current = await getApiKeyIndexStatus();
  if (current.exists && current.unique) {
    return { created: false };
  }

  try {
    if (current.exists && !current.unique) {
      await prisma.$executeRawUnsafe(`DROP INDEX "Agent_apiKey_key"`);
    }

    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX "Agent_apiKey_key" ON "Agent"("apiKey")`
    );

    const after = await getApiKeyIndexStatus();
    if (!after.exists || !after.unique) {
      return { created: false, error: "Failed to create a unique Agent_apiKey_key index." };
    }

    return { created: true };
  } catch (error) {
    return {
      created: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// GET /api/admin/fix-duplicate-keys — Diagnose duplicate apiKeys (read-only, admin only)
export async function GET() {
  try {
    const userId = await getCurrentUser();
    if (!userId || !ADMIN_USER_IDS.includes(userId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [allAgents, indexStatus] = await Promise.all([
      loadAgentsWithKeys(),
      getApiKeyIndexStatus(),
    ]);

    const duplicateGroups = findDuplicateGroups(allAgents);
    const duplicateRows = duplicateGroups.reduce(
      (sum, group) => sum + group.agents.length - 1,
      0
    );

    return NextResponse.json({
      total_agents: allAgents.length,
      unique_keys: allAgents.length - duplicateRows,
      duplicate_groups: duplicateGroups.length,
      index_status: indexStatus,
      duplicates: duplicateGroups.map((group) => ({
        key_prefix: `${group.apiKey.substring(0, 20)}...`,
        count: group.agents.length,
        agents: group.agents.map((agent) => ({
          id: agent.id,
          name: agent.name,
          owner: agent.user.username,
          userId: agent.userId,
          createdAt: agent.createdAt.toISOString(),
        })),
      })),
    });
  } catch (error) {
    console.error("Diagnose duplicate keys error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/admin/fix-duplicate-keys — Find and fix duplicate apiKeys in Agent table
// Protected by admin user check (JWT cookie) or ADMIN_SECRET env var.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      secret,
      dry_run,
      keep_agent_id,
    }: {
      secret?: string;
      dry_run?: boolean;
      keep_agent_id?: string;
    } = body;

    // Default to dry-run unless explicitly set to false.
    const dryRun = dry_run !== false;

    // Auth: either admin secret or admin user via JWT cookie
    const adminSecret = process.env.ADMIN_SECRET || process.env.JWT_SECRET;
    const userId = await getCurrentUser();
    const isAdmin =
      (secret && secret === adminSecret) ||
      (userId && ADMIN_USER_IDS.includes(userId));

    if (!isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [allAgents, indexBefore] = await Promise.all([
      loadAgentsWithKeys(),
      getApiKeyIndexStatus(),
    ]);

    const duplicateGroups = findDuplicateGroups(allAgents);

    if (duplicateGroups.length === 0) {
      return NextResponse.json({
        message: "No duplicate apiKeys found",
        dry_run: dryRun,
        duplicates: 0,
        total_agents: allAgents.length,
        index_before: indexBefore,
        index_after: indexBefore,
      });
    }

    const results = [];

    for (const group of duplicateGroups) {
      const keeper = keep_agent_id
        ? group.agents.find((agent) => agent.id === keep_agent_id) || group.agents[0]
        : group.agents[0];
      const others = group.agents.filter((agent) => agent.id !== keeper.id);

      for (const agent of others) {
        const newKey = generateApiKey();
        if (!dryRun) {
          await prisma.agent.update({
            where: { id: agent.id },
            data: { apiKey: newKey },
          });
        }

        results.push({
          action: dryRun ? "WOULD_FIX" : "FIXED",
          agent_id: agent.id,
          agent_name: agent.name,
          owner: agent.user.username,
          user_id: agent.userId,
          old_key_prefix: `${group.apiKey.substring(0, 20)}...`,
          new_key_prefix: dryRun ? "(dry run)" : `${newKey.substring(0, 20)}...`,
          kept_by_agent_id: keeper.id,
          kept_by: `${keeper.name} (${keeper.user.username})`,
        });
      }
    }

    let indexRepair: { created: boolean; error?: string } = { created: false };
    if (!dryRun) {
      indexRepair = await ensureApiKeyUniqueIndex();
    }

    const indexAfter = dryRun ? indexBefore : await getApiKeyIndexStatus();

    return NextResponse.json({
      message: dryRun
        ? `Found ${results.length} duplicate(s). Run with dry_run=false to fix.`
        : `Fixed ${results.length} duplicate apiKey(s).`,
      dry_run: dryRun,
      duplicates: duplicateGroups.length,
      total_agents: allAgents.length,
      keep_agent_id: keep_agent_id || null,
      index_before: indexBefore,
      index_after: indexAfter,
      index_repair: indexRepair,
      fixes: results,
    });
  } catch (error) {
    console.error("Fix duplicate keys error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyBearerAuth, extractBearerToken } from "@/lib/agent-auth";
import { getCurrentUser } from "@/lib/auth";
import {
  createManualMemoryRule,
  listMemoryRules,
  listSystemMemoryLogs,
  type MemoryCategory,
  type MemoryPolarity,
} from "@/lib/memory/learning";
import { buildMemoryProfileV2 } from "@/lib/memory/profile-v2";

const VALID_POLARITY = new Set<MemoryPolarity>(["approved", "rejected"]);
const VALID_CATEGORY = new Set<MemoryCategory>(["topic", "tone", "format", "behavior"]);

type MemoryRuleRow = {
  text: string;
  weight: number;
};

async function getAuthUserId(req: NextRequest): Promise<string | null> {
  const token = extractBearerToken(req.headers.get("authorization"));
  const agentAuth = token ? await verifyBearerAuth(token) : null;
  return agentAuth?.userId || (await getCurrentUser());
}

async function ensureAgentOwner(agentId: string, userId: string): Promise<{ id: string; name: string } | null> {
  return prisma.agent.findFirst({
    where: { id: agentId, userId },
    select: { id: true, name: true },
  });
}

function normalizeMemoryText(raw: string): string {
  return raw
    .replace(/^\[[^\]]+\]\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function summarizeMemoryRules(rules: MemoryRuleRow[]): string[] {
  const sorted = [...rules].sort((a, b) => b.weight - a.weight);
  const output: string[] = [];
  for (const rule of sorted) {
    const text = normalizeMemoryText(rule.text);
    if (!text || output.includes(text)) {
      continue;
    }
    output.push(text);
  }
  return output;
}

function buildMemoryProfile(memory: {
  approved: MemoryRuleRow[];
  rejected: MemoryRuleRow[];
}) {
  const workingStyle = summarizeMemoryRules(memory.approved).slice(0, 4);
  const avoidPatterns = summarizeMemoryRules(memory.rejected).slice(0, 3);

  if (workingStyle.length === 0 && avoidPatterns.length === 0) {
    return null;
  }

  const summaryParts: string[] = [];
  if (workingStyle.length > 0) {
    summaryParts.push(`Learns to favor: ${workingStyle.slice(0, 2).join("; ")}`);
  }
  if (avoidPatterns.length > 0) {
    summaryParts.push(`Learns to avoid: ${avoidPatterns.slice(0, 2).join("; ")}`);
  }

  return {
    summary: summaryParts.join(". "),
    working_style: workingStyle,
    avoid_patterns: avoidPatterns,
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const agent = await ensureAgentOwner(id, userId);
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const [memory, systemLogs, recentActivities] = await Promise.all([
    listMemoryRules(agent.id),
    listSystemMemoryLogs(agent.id, 100),
    prisma.agentActivityEvent.findMany({
      where: { agentId: agent.id },
      select: {
        type: true,
        payload: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 120,
    }),
  ]);

  return NextResponse.json({
    agent: { id: agent.id, name: agent.name },
    approved_rules: memory.approved.map((row) => ({
      id: row.id,
      category: row.category,
      text: row.text,
      weight: row.weight,
      evidence_count: row.evidenceCount,
      source: row.source,
      updated_at: row.updatedAt.toISOString(),
    })),
    rejected_rules: memory.rejected.map((row) => ({
      id: row.id,
      category: row.category,
      text: row.text,
      weight: row.weight,
      evidence_count: row.evidenceCount,
      source: row.source,
      updated_at: row.updatedAt.toISOString(),
    })),
    system_logs: systemLogs.map((log) => ({
      id: log.id,
      review_action: log.reviewAction,
      message: log.message,
      note: log.note,
      notification_id: log.notificationId,
      created_at: log.createdAt.toISOString(),
    })),
    memory_profile: buildMemoryProfile(memory),
    memory_profile_v2: buildMemoryProfileV2({
      approvedRules: memory.approved,
      rejectedRules: memory.rejected,
      systemLogs,
      activities: recentActivities,
    }),
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const agent = await ensureAgentOwner(id, userId);
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const polarity = body.polarity as MemoryPolarity;
  const category = body.category as MemoryCategory;
  const text = typeof body.text === "string" ? body.text : "";

  if (!VALID_POLARITY.has(polarity)) {
    return NextResponse.json({ error: "polarity must be approved or rejected" }, { status: 400 });
  }
  if (!VALID_CATEGORY.has(category)) {
    return NextResponse.json({ error: "category must be topic/tone/format/behavior" }, { status: 400 });
  }
  if (!text.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  try {
    const created = await createManualMemoryRule({
      agentId: agent.id,
      polarity,
      category,
      text,
    });
    return NextResponse.json({
      rule: {
        id: created.id,
        polarity: created.polarity,
        category: created.category,
        text: created.text,
        weight: created.weight,
        evidence_count: created.evidenceCount,
        source: created.source,
        updated_at: created.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "memory_rule_too_short") {
      return NextResponse.json({ error: "text too short" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to create memory rule" }, { status: 500 });
  }
}

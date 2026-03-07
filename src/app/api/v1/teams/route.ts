import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { verifyBearerAuth, extractBearerToken } from "@/lib/agent-auth";
import crypto from "node:crypto";

async function getAuthUserId(req: NextRequest): Promise<string | null> {
  const token = extractBearerToken(req.headers.get("authorization"));
  const agentAuth = token ? await verifyBearerAuth(token) : null;
  return agentAuth?.userId || (await getCurrentUser());
}

function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 30);
  const suffix = crypto.randomBytes(4).toString("hex");
  return `${base}-${suffix}`;
}

// GET /api/v1/teams — list current user's teams
export async function GET(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const memberships = await prisma.teamMember.findMany({
    where: { userId },
    include: {
      team: {
        include: {
          _count: { select: { members: true, channels: true } },
          createdBy: { select: { username: true } },
        },
      },
    },
    orderBy: { joinedAt: "desc" },
  });

  return NextResponse.json({
    teams: memberships.map((m) => ({
      id: m.team.id,
      name: m.team.name,
      slug: m.team.slug,
      description: m.team.description,
      avatar: m.team.avatar,
      source: m.team.source,
      role: m.role,
      member_count: m.team._count.members,
      channel_count: m.team._count.channels,
      created_by: m.team.createdBy.username,
      joined_at: m.joinedAt,
      created_at: m.team.createdAt,
    })),
  });
}

// POST /api/v1/teams — create a manual team
// Body: { name: string, description?: string }
export async function POST(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length < 2) {
    return NextResponse.json(
      { error: "name_required", message: "Team name must be at least 2 characters" },
      { status: 400 }
    );
  }

  const description = typeof body.description === "string" ? body.description.trim() : null;
  const slug = generateSlug(name);

  const team = await prisma.team.create({
    data: {
      name,
      slug,
      description,
      source: "manual",
      createdById: userId,
      members: {
        create: { userId, role: "owner" },
      },
      channels: {
        create: { name: "general", description: "General discussion" },
      },
    },
    include: {
      _count: { select: { members: true, channels: true } },
    },
  });

  return NextResponse.json(
    {
      id: team.id,
      name: team.name,
      slug: team.slug,
      description: team.description,
      source: team.source,
      member_count: team._count.members,
      channel_count: team._count.channels,
    },
    { status: 201 }
  );
}

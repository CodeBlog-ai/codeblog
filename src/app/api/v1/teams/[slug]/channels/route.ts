import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { verifyBearerAuth, extractBearerToken } from "@/lib/agent-auth";
import { requireTeamMember, requireRole } from "@/lib/team-auth";

async function getAuthUserId(req: NextRequest): Promise<string | null> {
  const token = extractBearerToken(req.headers.get("authorization"));
  const agentAuth = token ? await verifyBearerAuth(token) : null;
  return agentAuth?.userId || (await getCurrentUser());
}

// GET /api/v1/teams/[slug]/channels — list channels
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await requireTeamMember(userId, slug);
  if (!result) {
    return NextResponse.json({ error: "not_found_or_not_member" }, { status: 404 });
  }

  const channels = await prisma.teamChannel.findMany({
    where: { teamId: result.team.id },
    select: {
      id: true,
      name: true,
      description: true,
      createdAt: true,
      _count: { select: { messages: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    channels: channels.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      message_count: c._count.messages,
      created_at: c.createdAt,
    })),
  });
}

// POST /api/v1/teams/[slug]/channels — create channel (owner/admin)
// Body: { name: string, description?: string }
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await requireTeamMember(userId, slug);
  if (!result) {
    return NextResponse.json({ error: "not_found_or_not_member" }, { status: 404 });
  }
  if (!requireRole(result.member, "owner", "admin")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const name = typeof body.name === "string"
    ? body.name.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40)
    : "";
  if (!name || name.length < 2) {
    return NextResponse.json({ error: "name_required" }, { status: 400 });
  }

  const description = typeof body.description === "string" ? body.description.trim() : null;

  // Check for duplicate name
  const existing = await prisma.teamChannel.findUnique({
    where: { teamId_name: { teamId: result.team.id, name } },
  });
  if (existing) {
    return NextResponse.json({ error: "channel_name_taken" }, { status: 409 });
  }

  const channel = await prisma.teamChannel.create({
    data: { name, description, teamId: result.team.id },
  });

  return NextResponse.json(
    { id: channel.id, name: channel.name, description: channel.description },
    { status: 201 }
  );
}

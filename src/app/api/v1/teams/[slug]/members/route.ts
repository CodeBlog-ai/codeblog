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

// GET /api/v1/teams/[slug]/members — list team members
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

  const members = await prisma.teamMember.findMany({
    where: { teamId: result.team.id },
    include: {
      user: { select: { id: true, username: true, avatar: true, bio: true, githubUsername: true } },
    },
    orderBy: { joinedAt: "asc" },
  });

  return NextResponse.json({
    members: members.map((m) => ({
      user_id: m.user.id,
      username: m.user.username,
      avatar: m.user.avatar,
      bio: m.user.bio,
      github_username: m.user.githubUsername,
      role: m.role,
      joined_at: m.joinedAt,
    })),
  });
}

// POST /api/v1/teams/[slug]/members — add member by username
// Body: { username: string }
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

  const username = typeof body.username === "string" ? body.username.trim() : "";
  if (!username) {
    return NextResponse.json({ error: "username_required" }, { status: 400 });
  }

  const targetUser = await prisma.user.findUnique({
    where: { username },
    select: { id: true },
  });
  if (!targetUser) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  // Check if already a member
  const existing = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId: result.team.id, userId: targetUser.id } },
  });
  if (existing) {
    return NextResponse.json({ error: "already_member" }, { status: 409 });
  }

  await prisma.teamMember.create({
    data: { teamId: result.team.id, userId: targetUser.id, role: "member" },
  });

  return NextResponse.json({ added: true, user_id: targetUser.id }, { status: 201 });
}

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

// PATCH /api/v1/teams/[slug]/members/[userId] — change member role
// Body: { role: "admin" | "member" }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; userId: string }> }
) {
  const { slug, userId: targetUserId } = await params;
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await requireTeamMember(userId, slug);
  if (!result) {
    return NextResponse.json({ error: "not_found_or_not_member" }, { status: 404 });
  }
  if (!requireRole(result.member, "owner")) {
    return NextResponse.json({ error: "only_owner_can_change_roles" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const role = body.role;
  if (role !== "admin" && role !== "member") {
    return NextResponse.json({ error: "invalid_role" }, { status: 400 });
  }

  const targetMember = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId: result.team.id, userId: targetUserId } },
  });
  if (!targetMember) {
    return NextResponse.json({ error: "member_not_found" }, { status: 404 });
  }
  if (targetMember.role === "owner") {
    return NextResponse.json({ error: "cannot_change_owner_role" }, { status: 403 });
  }

  await prisma.teamMember.update({
    where: { id: targetMember.id },
    data: { role },
  });

  return NextResponse.json({ updated: true, role });
}

// DELETE /api/v1/teams/[slug]/members/[userId] — remove member or leave team
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; userId: string }> }
) {
  const { slug, userId: targetUserId } = await params;
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await requireTeamMember(userId, slug);
  if (!result) {
    return NextResponse.json({ error: "not_found_or_not_member" }, { status: 404 });
  }

  const isSelf = userId === targetUserId;

  if (!isSelf && !requireRole(result.member, "owner", "admin")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const targetMember = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId: result.team.id, userId: targetUserId } },
  });
  if (!targetMember) {
    return NextResponse.json({ error: "member_not_found" }, { status: 404 });
  }
  if (targetMember.role === "owner") {
    return NextResponse.json({ error: "owner_cannot_leave" }, { status: 403 });
  }

  await prisma.teamMember.delete({ where: { id: targetMember.id } });

  return NextResponse.json({ removed: true });
}

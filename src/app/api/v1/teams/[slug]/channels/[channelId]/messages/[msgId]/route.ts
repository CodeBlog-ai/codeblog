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

type Params = { slug: string; channelId: string; msgId: string };

// PATCH /api/v1/teams/[slug]/channels/[channelId]/messages/[msgId] — edit message
// Body: { content: string }
export async function PATCH(req: NextRequest, { params }: { params: Promise<Params> }) {
  const { slug, channelId, msgId } = await params;
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await requireTeamMember(userId, slug);
  if (!result) {
    return NextResponse.json({ error: "not_found_or_not_member" }, { status: 404 });
  }

  const message = await prisma.teamMessage.findFirst({
    where: {
      id: msgId,
      channelId,
      channel: { teamId: result.team.id },
    },
    select: { id: true, userId: true },
  });
  if (!message) {
    return NextResponse.json({ error: "message_not_found" }, { status: 404 });
  }

  // Only the author can edit their own message
  if (message.userId !== userId) {
    return NextResponse.json({ error: "not_your_message" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) {
    return NextResponse.json({ error: "content_required" }, { status: 400 });
  }

  const updated = await prisma.teamMessage.update({
    where: { id: msgId },
    data: { content },
    select: { id: true, content: true, updatedAt: true },
  });

  return NextResponse.json(updated);
}

// DELETE /api/v1/teams/[slug]/channels/[channelId]/messages/[msgId] — delete message
export async function DELETE(req: NextRequest, { params }: { params: Promise<Params> }) {
  const { slug, channelId, msgId } = await params;
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await requireTeamMember(userId, slug);
  if (!result) {
    return NextResponse.json({ error: "not_found_or_not_member" }, { status: 404 });
  }

  const message = await prisma.teamMessage.findFirst({
    where: {
      id: msgId,
      channelId,
      channel: { teamId: result.team.id },
    },
    select: { id: true, userId: true },
  });
  if (!message) {
    return NextResponse.json({ error: "message_not_found" }, { status: 404 });
  }

  // Author or team owner/admin can delete
  const isAuthor = message.userId === userId;
  const isAdmin = requireRole(result.member, "owner", "admin");
  if (!isAuthor && !isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await prisma.teamMessage.delete({ where: { id: msgId } });

  return NextResponse.json({ deleted: true });
}

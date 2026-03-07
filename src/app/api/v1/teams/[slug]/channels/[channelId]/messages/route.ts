import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { verifyBearerAuth, extractBearerToken } from "@/lib/agent-auth";
import { requireTeamMember } from "@/lib/team-auth";

async function getAuthUserId(req: NextRequest): Promise<string | null> {
  const token = extractBearerToken(req.headers.get("authorization"));
  const agentAuth = token ? await verifyBearerAuth(token) : null;
  return agentAuth?.userId || (await getCurrentUser());
}

type Params = { slug: string; channelId: string };

async function getCursorCreatedAt(channelId: string, before: string) {
  const cursorMessage = await prisma.teamMessage.findFirst({
    where: { id: before, channelId },
    select: { createdAt: true },
  });
  return cursorMessage?.createdAt ?? null;
}

// GET /api/v1/teams/[slug]/channels/[channelId]/messages — list messages
export async function GET(req: NextRequest, { params }: { params: Promise<Params> }) {
  const { slug, channelId } = await params;
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await requireTeamMember(userId, slug);
  if (!result) {
    return NextResponse.json({ error: "not_found_or_not_member" }, { status: 404 });
  }

  // Verify channel belongs to this team
  const channel = await prisma.teamChannel.findFirst({
    where: { id: channelId, teamId: result.team.id },
  });
  if (!channel) {
    return NextResponse.json({ error: "channel_not_found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
  const before = url.searchParams.get("before"); // cursor: message id
  const cursorCreatedAt = before ? await getCursorCreatedAt(channelId, before) : null;

  if (before && !cursorCreatedAt) {
    return NextResponse.json({ error: "invalid_cursor" }, { status: 400 });
  }

  const messages = await prisma.teamMessage.findMany({
    where: {
      channelId,
      parentId: null, // top-level messages only
      ...(cursorCreatedAt ? { createdAt: { lt: cursorCreatedAt } } : {}),
    },
    include: {
      user: { select: { id: true, username: true, avatar: true } },
      agent: { select: { id: true, name: true, sourceType: true } },
      _count: { select: { replies: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json({
    channel: { id: channel.id, name: channel.name },
    messages: messages.reverse().map((m) => ({
      id: m.id,
      content: m.content,
      user: m.user,
      agent: m.agent,
      reply_count: m._count.replies,
      created_at: m.createdAt,
      updated_at: m.updatedAt,
    })),
    has_more: messages.length === limit,
  });
}

// POST /api/v1/teams/[slug]/channels/[channelId]/messages — send message
// Body: { content: string, parent_id?: string }
export async function POST(req: NextRequest, { params }: { params: Promise<Params> }) {
  const { slug, channelId } = await params;
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await requireTeamMember(userId, slug);
  if (!result) {
    return NextResponse.json({ error: "not_found_or_not_member" }, { status: 404 });
  }

  const channel = await prisma.teamChannel.findFirst({
    where: { id: channelId, teamId: result.team.id },
  });
  if (!channel) {
    return NextResponse.json({ error: "channel_not_found" }, { status: 404 });
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

  const parentId = typeof body.parent_id === "string" ? body.parent_id : null;

  if (parentId) {
    const parentMessage = await prisma.teamMessage.findFirst({
      where: { id: parentId, channelId },
      select: { id: true },
    });
    if (!parentMessage) {
      return NextResponse.json({ error: "parent_message_not_found" }, { status: 404 });
    }
  }

  const message = await prisma.teamMessage.create({
    data: { content, channelId, userId, parentId },
    include: {
      user: { select: { id: true, username: true, avatar: true } },
    },
  });

  return NextResponse.json(
    {
      id: message.id,
      content: message.content,
      user: message.user,
      parent_id: message.parentId,
      created_at: message.createdAt,
    },
    { status: 201 }
  );
}

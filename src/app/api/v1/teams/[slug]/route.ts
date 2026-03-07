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

// GET /api/v1/teams/[slug] — team details with members and channels
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

  const team = await prisma.team.findUnique({
    where: { slug },
    include: {
      members: {
        include: {
          user: { select: { id: true, username: true, avatar: true, email: true } },
        },
        orderBy: { joinedAt: "asc" },
      },
      channels: {
        select: { id: true, name: true, description: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
      createdBy: { select: { id: true, username: true } },
    },
  });

  if (!team) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({
    id: team.id,
    name: team.name,
    slug: team.slug,
    description: team.description,
    avatar: team.avatar,
    source: team.source,
    source_meta: team.sourceMeta ? JSON.parse(team.sourceMeta) : null,
    created_by: team.createdBy,
    created_at: team.createdAt,
    my_role: result.member.role,
    slack_webhook_url: requireRole(result.member, "owner", "admin")
      ? (team.slackWebhookUrl || null)
      : null,
    slack_bot_channel_id: team.slackBotChannelId || null,
    slack_bot_channel_name: team.slackBotChannelName || null,
    slack_bot_installed: !!team.slackBotToken,
    members: team.members.map((m) => ({
      user_id: m.user.id,
      username: m.user.username,
      avatar: m.user.avatar,
      role: m.role,
      joined_at: m.joinedAt,
    })),
    channels: team.channels,
  });
}

// PATCH /api/v1/teams/[slug] — update team (owner/admin only)
// Body: { name?: string, description?: string }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
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

  const data: Record<string, string | null> = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (typeof body.description === "string") data.description = body.description.trim();

  // Slack webhook URL (set to empty string or null to remove)
  if ("slack_webhook_url" in body) {
    const url = typeof body.slack_webhook_url === "string" ? body.slack_webhook_url.trim() : "";
    if (url && !url.startsWith("https://hooks.slack.com/")) {
      return NextResponse.json({ error: "invalid_webhook_url" }, { status: 400 });
    }
    data.slackWebhookUrl = url || null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "no_changes" }, { status: 400 });
  }

  const updated = await prisma.team.update({
    where: { slug },
    data,
    select: { id: true, name: true, slug: true, description: true, slackWebhookUrl: true },
  });

  return NextResponse.json(updated);
}

// DELETE /api/v1/teams/[slug] — delete team (owner only)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await requireTeamMember(userId, slug);
  if (!result) {
    return NextResponse.json({ error: "not_found_or_not_member" }, { status: 404 });
  }
  if (!requireRole(result.member, "owner")) {
    return NextResponse.json({ error: "only_owner_can_delete" }, { status: 403 });
  }

  await prisma.team.delete({ where: { slug } });

  return NextResponse.json({ deleted: true });
}

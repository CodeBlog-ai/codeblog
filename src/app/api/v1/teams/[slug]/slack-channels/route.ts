import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireTeamMember, requireRole } from "@/lib/team-auth";

// GET /api/v1/teams/[slug]/slack-channels — list channels the bot can post to
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const userId = await getCurrentUser();
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

  const team = await prisma.team.findUnique({
    where: { slug },
    select: { slackBotToken: true, slackBotChannelId: true },
  });

  if (!team?.slackBotToken) {
    return NextResponse.json({ error: "slack_bot_not_installed" }, { status: 400 });
  }

  // Fetch channels from Slack
  const res = await fetch("https://slack.com/api/conversations.list?types=public_channel&exclude_archived=true&limit=200", {
    headers: { Authorization: `Bearer ${team.slackBotToken}` },
  });
  const data = await res.json();

  if (!data.ok) {
    return NextResponse.json({ error: "slack_api_error", detail: data.error }, { status: 502 });
  }

  const channels = (data.channels || []).map((ch: { id: string; name: string; is_member: boolean }) => ({
    id: ch.id,
    name: ch.name,
    is_member: ch.is_member,
  }));

  return NextResponse.json({
    channels,
    selected_channel_id: team.slackBotChannelId,
  });
}

// PATCH /api/v1/teams/[slug]/slack-channels — select a channel for notifications
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const userId = await getCurrentUser();
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

  const channelId = typeof body.channel_id === "string" ? body.channel_id : null;
  const channelName = typeof body.channel_name === "string" ? body.channel_name : null;

  if (!channelId) {
    return NextResponse.json({ error: "channel_id_required" }, { status: 400 });
  }

  await prisma.team.update({
    where: { slug },
    data: {
      slackBotChannelId: channelId,
      slackBotChannelName: channelName,
    },
  });

  return NextResponse.json({ ok: true, channel_id: channelId, channel_name: channelName });
}

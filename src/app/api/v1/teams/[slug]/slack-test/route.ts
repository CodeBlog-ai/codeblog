import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireTeamMember, requireRole } from "@/lib/team-auth";
import { sendTestSlackNotification } from "@/lib/slack-notify";

// POST /api/v1/teams/[slug]/slack-test — send test notification
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
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
    select: { slackWebhookUrl: true, slackBotToken: true, slackBotChannelId: true },
  });

  if (!team) {
    return NextResponse.json({ error: "team_not_found" }, { status: 404 });
  }

  const res = await sendTestSlackNotification(team);
  return NextResponse.json(res, { status: res.ok ? 200 : 400 });
}

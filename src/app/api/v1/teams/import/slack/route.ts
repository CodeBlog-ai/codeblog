import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import crypto from "node:crypto";

function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 30);
  const suffix = crypto.randomBytes(4).toString("hex");
  return `${base}-${suffix}`;
}

async function fetchSlackWorkspaceMemberEmails(token: string): Promise<string[] | null> {
  const memberEmails: string[] = [];
  let cursor = "";

  while (true) {
    const url = new URL("https://slack.com/api/users.list");
    url.searchParams.set("limit", "200");
    if (cursor) {
      url.searchParams.set("cursor", cursor);
    }

    const membersRes = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const membersData = await membersRes.json();

    if (!membersData.ok || !Array.isArray(membersData.members)) {
      return null;
    }

    for (const member of membersData.members) {
      if (member.deleted || member.is_bot || member.id === "USLACKBOT") continue;
      const email = member.profile?.email;
      if (email) memberEmails.push(email.toLowerCase());
    }

    cursor = typeof membersData.response_metadata?.next_cursor === "string"
      ? membersData.response_metadata.next_cursor
      : "";
    if (!cursor) break;
  }

  return memberEmails;
}

async function syncTeamMembers(teamId: string, userIds: string[]): Promise<number> {
  if (userIds.length === 0) return 0;

  const uniqueUserIds = [...new Set(userIds)];
  const existingMembers = await prisma.teamMember.findMany({
    where: { teamId, userId: { in: uniqueUserIds } },
    select: { userId: true },
  });
  const existingUserIds = new Set(existingMembers.map((member) => member.userId));
  const newUserIds = uniqueUserIds.filter((id) => !existingUserIds.has(id));

  if (newUserIds.length === 0) return 0;

  await prisma.teamMember.createMany({
    data: newUserIds.map((id) => ({ teamId, userId: id, role: "member" })),
    skipDuplicates: true,
  });

  return newUserIds.length;
}

// POST /api/v1/teams/import/slack
// Body: { team_id?: string } — optional Slack team ID to import
export async function POST(req: NextRequest) {
  const userId = await getCurrentUser();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Get stored Slack token
  const oauthAccount = await prisma.oAuthAccount.findUnique({
    where: { userId_provider: { userId, provider: "slack" } },
    select: { accessToken: true },
  });
  if (!oauthAccount?.accessToken) {
    return NextResponse.json({ error: "slack_not_connected" }, { status: 400 });
  }

  const token = oauthAccount.accessToken;

  // Get workspace info
  const teamInfoRes = await fetch("https://slack.com/api/team.info", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const teamInfo = await teamInfoRes.json();
  if (!teamInfo.ok) {
    return NextResponse.json({ error: "slack_team_info_failed", detail: teamInfo.error }, { status: 502 });
  }

  const slackTeam = teamInfo.team;
  const slackTeamId = (typeof body.team_id === "string" && body.team_id) || slackTeam.id;

  // Check if team already exists for this workspace
  const existing = await prisma.team.findFirst({
    where: { source: "slack_workspace", sourceId: slackTeamId },
    select: { id: true, slug: true, name: true },
  });
  const memberEmails = await fetchSlackWorkspaceMemberEmails(token);
  if (!memberEmails) {
    return NextResponse.json({ error: "slack_members_fetch_failed" }, { status: 502 });
  }

  // Match CodeBlog users by email
  const matchedUsers = await prisma.user.findMany({
    where: {
      email: { in: memberEmails, mode: "insensitive" },
    },
    select: { id: true, username: true, email: true },
  });

  if (existing) {
    await syncTeamMembers(existing.id, [userId, ...matchedUsers.map((user) => user.id)]);

    return NextResponse.json({
      team_slug: existing.slug,
      team_name: existing.name,
      matched_members: matchedUsers.length,
      total_workspace_members: memberEmails.length,
      joined_existing_team: true,
    });
  }

  // Build team name and avatar
  const teamName = slackTeam.name || "Slack Workspace";
  const teamIcon =
    slackTeam.icon?.image_132 ||
    slackTeam.icon?.image_88 ||
    slackTeam.icon?.image_68 ||
    null;

  // Create team with matched members
  const team = await prisma.team.create({
    data: {
      name: teamName,
      slug: generateSlug(teamName),
      description: slackTeam.domain ? `Slack workspace: ${slackTeam.domain}.slack.com` : null,
      avatar: teamIcon,
      source: "slack_workspace",
      sourceId: slackTeamId,
      sourceMeta: JSON.stringify({
        domain: slackTeam.domain,
        icon: teamIcon,
      }),
      createdById: userId,
      members: {
        create: [
          { userId, role: "owner" },
          ...matchedUsers
            .filter((u) => u.id !== userId)
            .map((u) => ({ userId: u.id, role: "member" as const })),
        ],
      },
      channels: {
        create: [{ name: "general", description: "General discussion" }],
      },
    },
    include: { _count: { select: { members: true } } },
  });

  return NextResponse.json(
    {
      team_slug: team.slug,
      team_name: team.name,
      matched_members: matchedUsers.length,
      total_workspace_members: memberEmails.length,
    },
    { status: 201 }
  );
}

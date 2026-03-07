import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import crypto from "node:crypto";

const GITHUB_HEADERS = {
  Accept: "application/json",
};

function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 30);
  const suffix = crypto.randomBytes(4).toString("hex");
  return `${base}-${suffix}`;
}

async function fetchGitHubOrgMembers(token: string, orgLogin: string): Promise<string[] | null> {
  const memberLogins: string[] = [];
  let page = 1;

  while (true) {
    const membersRes = await fetch(
      `https://api.github.com/orgs/${orgLogin}/members?per_page=100&page=${page}`,
      {
        headers: {
          ...GITHUB_HEADERS,
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!membersRes.ok) {
      return null;
    }

    const members = (await membersRes.json()) as Array<{ login: string }>;
    memberLogins.push(...members.map((member) => member.login.toLowerCase()));

    if (members.length < 100) break;
    page += 1;
  }

  return memberLogins;
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

// POST /api/v1/teams/import/github-org
// Body: { org_login: string }
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

  const orgLogin = typeof body.org_login === "string" ? body.org_login.trim() : "";
  if (!orgLogin) {
    return NextResponse.json({ error: "org_login_required" }, { status: 400 });
  }

  // Get stored token
  const oauthAccount = await prisma.oAuthAccount.findUnique({
    where: { userId_provider: { userId, provider: "github_org" } },
    select: { accessToken: true },
  });
  if (!oauthAccount?.accessToken) {
    return NextResponse.json({ error: "github_org_not_connected" }, { status: 400 });
  }

  const token = oauthAccount.accessToken;

  const membershipRes = await fetch(`https://api.github.com/user/memberships/orgs/${orgLogin}`, {
    headers: { ...GITHUB_HEADERS, Authorization: `Bearer ${token}` },
  });
  if (membershipRes.status === 404) {
    return NextResponse.json({ error: "not_org_member" }, { status: 403 });
  }
  if (!membershipRes.ok) {
    return NextResponse.json({ error: "github_membership_check_failed" }, { status: 502 });
  }

  // Get org info
  const orgRes = await fetch(`https://api.github.com/orgs/${orgLogin}`, {
    headers: { ...GITHUB_HEADERS, Authorization: `Bearer ${token}` },
  });
  if (!orgRes.ok) {
    return NextResponse.json({ error: "org_not_found" }, { status: 404 });
  }
  const org = await orgRes.json();

  const memberLogins = await fetchGitHubOrgMembers(token, orgLogin);
  if (!memberLogins) {
    return NextResponse.json({ error: "github_org_members_fetch_failed" }, { status: 502 });
  }

  // Check if team already exists for this org
  const existing = await prisma.team.findFirst({
    where: { source: "github_org", sourceId: String(org.id) },
    select: { id: true, slug: true, name: true },
  });

  // Match CodeBlog users by githubUsername
  const matchedUsers = await prisma.user.findMany({
    where: {
      githubUsername: { in: memberLogins, mode: "insensitive" },
    },
    select: { id: true, username: true, githubUsername: true },
  });

  if (existing) {
    await syncTeamMembers(existing.id, [userId, ...matchedUsers.map((user) => user.id)]);

    return NextResponse.json({
      team_slug: existing.slug,
      team_name: existing.name,
      matched_members: matchedUsers.length,
      total_org_members: memberLogins.length,
      joined_existing_team: true,
    });
  }

  // Create team with matched members
  const team = await prisma.team.create({
    data: {
      name: org.name || org.login,
      slug: generateSlug(org.login),
      description: org.description || null,
      avatar: org.avatar_url || null,
      source: "github_org",
      sourceId: String(org.id),
      sourceMeta: JSON.stringify({ orgLogin: org.login, orgAvatarUrl: org.avatar_url }),
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

  return NextResponse.json({
    team_slug: team.slug,
    team_name: team.name,
    matched_members: matchedUsers.length,
    total_org_members: memberLogins.length,
  }, { status: 201 });
}

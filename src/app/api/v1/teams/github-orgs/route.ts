import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

// GET /api/v1/teams/github-orgs — list user's GitHub organizations
export async function GET(req: NextRequest) {
  const userId = await getCurrentUser();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Find the stored GitHub Org OAuth token
  const oauthAccount = await prisma.oAuthAccount.findUnique({
    where: { userId_provider: { userId, provider: "github_org" } },
    select: { accessToken: true },
  });

  if (!oauthAccount?.accessToken) {
    return NextResponse.json({
      error: "github_org_not_connected",
      message: "Connect GitHub with org scope first via /api/auth/github-org",
    }, { status: 400 });
  }

  // Fetch user's organizations
  const res = await fetch("https://api.github.com/user/orgs?per_page=50", {
    headers: {
      Authorization: `Bearer ${oauthAccount.accessToken}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    return NextResponse.json({ error: "github_api_error", status: res.status }, { status: 502 });
  }

  const orgs = await res.json();

  return NextResponse.json({
    orgs: orgs.map((org: { id: number; login: string; avatar_url: string; description: string | null }) => ({
      id: org.id,
      login: org.login,
      avatar_url: org.avatar_url,
      description: org.description,
    })),
  });
}

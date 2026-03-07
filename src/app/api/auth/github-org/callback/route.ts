import { NextRequest, NextResponse } from "next/server";
import { getOAuthOrigin } from "@/lib/oauth-origin";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GitHub Org OAuth callback — stores token with read:org scope
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const savedState = req.cookies.get("oauth_state_github_org")?.value;

  if (!code || !state || state !== savedState) {
    return NextResponse.redirect(new URL("/teams/new?error=invalid_state", req.url));
  }

  const userId = await getCurrentUser();
  if (!userId) {
    return NextResponse.redirect(new URL("/login?return_to=/teams/new", req.url));
  }

  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/teams/new?error=github_not_configured", req.url));
  }

  // Exchange code for token
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  });
  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;
  if (!accessToken) {
    return NextResponse.redirect(new URL("/teams/new?error=token_exchange_failed", req.url));
  }

  // Get GitHub user info
  const userRes = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  const githubUser = await userRes.json();

  // Store/update the OAuth account with the new token and scope
  await prisma.oAuthAccount.upsert({
    where: { userId_provider: { userId, provider: "github_org" } },
    create: {
      userId,
      provider: "github_org",
      providerId: String(githubUser.id),
      email: githubUser.email,
      accessToken,
      tokenScope: "read:user user:email read:org",
    },
    update: {
      accessToken,
      tokenScope: "read:user user:email read:org",
    },
  });

  // Clear state cookie and redirect to team creation
  const origin = getOAuthOrigin(req);
  const response = NextResponse.redirect(`${origin}/teams/new?github_org_connected=true`);
  response.cookies.delete("oauth_state_github_org");

  return response;
}

import { NextRequest, NextResponse } from "next/server";
import { getOAuthOrigin } from "@/lib/oauth-origin";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";

// Slack OAuth callback — exchanges code for user token
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const savedState = req.cookies.get("oauth_state_slack")?.value;

  if (!code || !state || state !== savedState) {
    return NextResponse.redirect(new URL("/teams/new?error=invalid_state", req.url));
  }

  const userId = await getCurrentUser();
  if (!userId) {
    return NextResponse.redirect(new URL("/login?return_to=/teams/new", req.url));
  }

  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/teams/new?error=slack_not_configured", req.url));
  }

  const origin = getOAuthOrigin(req);
  const redirectUri = `${origin}/api/auth/slack/callback`;

  // Exchange code for token
  const tokenRes = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });
  const tokenData = await tokenRes.json();

  if (!tokenData.ok || !tokenData.authed_user?.access_token) {
    return NextResponse.redirect(new URL("/teams/new?error=token_exchange_failed", req.url));
  }

  const accessToken = tokenData.authed_user.access_token;
  const slackUserId = tokenData.authed_user.id;
  const teamId = tokenData.team?.id || "";
  const scope = tokenData.authed_user.scope || "";

  // Store/update the OAuth account
  await prisma.oAuthAccount.upsert({
    where: { userId_provider: { userId, provider: "slack" } },
    create: {
      userId,
      provider: "slack",
      providerId: slackUserId,
      accessToken,
      tokenScope: scope,
    },
    update: {
      providerId: slackUserId,
      accessToken,
      tokenScope: scope,
    },
  });

  // Clear state cookie and redirect
  const response = NextResponse.redirect(
    `${origin}/teams/new?slack_connected=true&slack_team_id=${teamId}`
  );
  response.cookies.delete("oauth_state_slack");

  return response;
}

import { NextRequest, NextResponse } from "next/server";
import { getOAuthOrigin } from "@/lib/oauth-origin";
import { getCurrentUser } from "@/lib/auth";
import { requireTeamMember, requireRole } from "@/lib/team-auth";
import prisma from "@/lib/prisma";

// Slack Bot OAuth callback — stores bot token on the Team
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const savedState = req.cookies.get("oauth_state_slack_bot")?.value;

  if (!code || !state || state !== savedState) {
    return NextResponse.redirect(new URL("/teams?error=invalid_state", req.url));
  }

  // Extract teamSlug from state (format: "uuid:teamSlug")
  const teamSlug = state.split(":").slice(1).join(":");
  if (!teamSlug) {
    return NextResponse.redirect(new URL("/teams?error=missing_team", req.url));
  }

  const userId = await getCurrentUser();
  if (!userId) {
    return NextResponse.redirect(new URL(`/login?return_to=/teams/${teamSlug}`, req.url));
  }

  // Verify user is admin/owner of the team
  const result = await requireTeamMember(userId, teamSlug);
  if (!result || !requireRole(result.member, "owner", "admin")) {
    return NextResponse.redirect(new URL(`/teams/${teamSlug}?error=forbidden`, req.url));
  }

  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL(`/teams/${teamSlug}?error=slack_not_configured`, req.url));
  }

  const origin = getOAuthOrigin(req);
  const redirectUri = `${origin}/api/auth/slack-bot/callback`;

  // Exchange code for bot token
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

  if (!tokenData.ok || !tokenData.access_token) {
    return NextResponse.redirect(new URL(`/teams/${teamSlug}?error=token_exchange_failed`, req.url));
  }

  // Store bot token on the team
  await prisma.team.update({
    where: { slug: teamSlug },
    data: { slackBotToken: tokenData.access_token },
  });

  // Clear state cookie and redirect to team page
  const response = NextResponse.redirect(`${origin}/teams/${teamSlug}?slack_bot_installed=true`);
  response.cookies.delete("oauth_state_slack_bot");

  return response;
}

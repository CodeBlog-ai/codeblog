import { NextRequest, NextResponse } from "next/server";
import { getOAuthOrigin } from "@/lib/oauth-origin";

// Slack Bot OAuth — installs bot to workspace with chat:write + channels:read
export async function GET(req: NextRequest) {
  const clientId = process.env.SLACK_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "Slack OAuth not configured" }, { status: 500 });
  }

  const teamSlug = req.nextUrl.searchParams.get("team");
  if (!teamSlug) {
    return NextResponse.json({ error: "team parameter required" }, { status: 400 });
  }

  const redirectUri = `${getOAuthOrigin(req)}/api/auth/slack-bot/callback`;
  const state = `${crypto.randomUUID()}:${teamSlug}`;

  const params = new URLSearchParams({
    client_id: clientId,
    scope: "chat:write,channels:read",
    redirect_uri: redirectUri,
    state,
  });

  const response = NextResponse.redirect(`https://slack.com/oauth/v2/authorize?${params}`);
  response.cookies.set("oauth_state_slack_bot", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return response;
}

import { NextRequest, NextResponse } from "next/server";
import { getOAuthOrigin } from "@/lib/oauth-origin";

// Slack OAuth — user token with users:read, users.read.email, team:read scopes
export async function GET(req: NextRequest) {
  const clientId = process.env.SLACK_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "Slack OAuth not configured" }, { status: 500 });
  }

  const redirectUri = `${getOAuthOrigin(req)}/api/auth/slack/callback`;
  const state = crypto.randomUUID();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    user_scope: "users:read,users.read.email,team:read",
    state,
  });

  const response = NextResponse.redirect(`https://slack.com/oauth/v2/authorize?${params}`);
  response.cookies.set("oauth_state_slack", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return response;
}

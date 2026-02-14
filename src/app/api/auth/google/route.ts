import { NextRequest, NextResponse } from "next/server";
import { getOAuthOrigin } from "@/lib/oauth-origin";

// Google OAuth Step 1: Redirect user to Google authorization page
export async function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "Google OAuth not configured" }, { status: 500 });
  }

  const redirectUri = `${getOAuthOrigin(req)}/api/auth/google/callback`;
  const state = crypto.randomUUID();
  const inputIntent = req.nextUrl.searchParams.get("intent");
  const intent =
    inputIntent === "link" || inputIntent === "signup" || inputIntent === "login"
      ? inputIntent
      : "login";
  const rawReturnTo = req.nextUrl.searchParams.get("return_to");
  const returnTo = rawReturnTo && rawReturnTo.startsWith("/") ? rawReturnTo : "/settings";

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "offline",
    prompt: "consent",
  });

  const response = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  response.cookies.set("oauth_state_google", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  response.cookies.set("oauth_intent_google", intent, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  response.cookies.set("oauth_return_to_google", returnTo, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return response;
}

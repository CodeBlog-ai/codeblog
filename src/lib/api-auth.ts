import { NextRequest, NextResponse } from "next/server";
import { verifyBearerAuth, extractBearerToken } from "@/lib/agent-auth";

export type ApiAuth = { userId: string; agentId?: string };

type RouteContext = { params: Promise<Record<string, string>> };

/**
 * Wrap an API route handler with required Bearer auth.
 * Automatically extracts & verifies the token; returns 401 on failure.
 */
export function withApiAuth<C extends RouteContext | undefined = undefined>(
  handler: C extends RouteContext
    ? (req: NextRequest, ctx: C, auth: ApiAuth) => Promise<NextResponse>
    : (req: NextRequest, auth: ApiAuth) => Promise<NextResponse>
) {
  return async (req: NextRequest, ctx?: C): Promise<NextResponse> => {
    const token = extractBearerToken(req.headers.get("authorization"));
    const auth = token ? await verifyBearerAuth(token) : null;

    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Route handlers with params use (req, ctx, auth), non-param handlers use (req, auth).
    // Next.js may still provide a second argument for non-dynamic routes, so we must branch
    // by handler arity instead of ctx presence.
    const expectsContext = handler.length >= 3;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return expectsContext ? (handler as any)(req, ctx, auth) : (handler as any)(req, auth);
  };
}

/**
 * Wrap an API route handler with optional Bearer auth.
 * auth is null when no valid token is present (no 401 returned).
 */
export function optionalApiAuth<C extends RouteContext | undefined = undefined>(
  handler: C extends RouteContext
    ? (req: NextRequest, ctx: C, auth: ApiAuth | null) => Promise<NextResponse>
    : (req: NextRequest, auth: ApiAuth | null) => Promise<NextResponse>
) {
  return async (req: NextRequest, ctx?: C): Promise<NextResponse> => {
    const token = extractBearerToken(req.headers.get("authorization"));
    const auth = token ? await verifyBearerAuth(token) : null;

    const expectsContext = handler.length >= 3;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return expectsContext ? (handler as any)(req, ctx, auth) : (handler as any)(req, auth);
  };
}

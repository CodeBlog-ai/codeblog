import { NextResponse } from "next/server";

// GET /api/v1/teams/providers — check which import providers are configured
export function GET() {
  return NextResponse.json({
    github_org: !!process.env.GITHUB_CLIENT_ID,
    slack: !!process.env.SLACK_CLIENT_ID,
  });
}

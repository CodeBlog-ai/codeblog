import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { verifyBearerAuth, extractBearerToken } from "@/lib/agent-auth";
import { requireTeamMember, requireRole } from "@/lib/team-auth";
import crypto from "node:crypto";

async function getAuthUserId(req: NextRequest): Promise<string | null> {
  const token = extractBearerToken(req.headers.get("authorization"));
  const agentAuth = token ? await verifyBearerAuth(token) : null;
  return agentAuth?.userId || (await getCurrentUser());
}

// POST /api/v1/teams/[slug]/invites — create invite link
// Body: { max_uses?: number, expires_in_hours?: number }
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await requireTeamMember(userId, slug);
  if (!result) {
    return NextResponse.json({ error: "not_found_or_not_member" }, { status: 404 });
  }
  if (!requireRole(result.member, "owner", "admin")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // no body is fine, use defaults
  }

  const maxUses = typeof body.max_uses === "number" ? body.max_uses : 0;
  const expiresInHours = typeof body.expires_in_hours === "number" ? body.expires_in_hours : 0;
  const expiresAt = expiresInHours > 0
    ? new Date(Date.now() + expiresInHours * 60 * 60 * 1000)
    : null;

  const code = crypto.randomBytes(4).toString("hex"); // 8-char hex code

  const invite = await prisma.teamInvite.create({
    data: {
      code,
      maxUses,
      expiresAt,
      teamId: result.team.id,
      createdById: userId,
    },
  });

  return NextResponse.json(
    {
      code: invite.code,
      max_uses: invite.maxUses,
      expires_at: invite.expiresAt,
    },
    { status: 201 }
  );
}

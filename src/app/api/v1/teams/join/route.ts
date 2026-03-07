import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { verifyBearerAuth, extractBearerToken } from "@/lib/agent-auth";

async function getAuthUserId(req: NextRequest): Promise<string | null> {
  const token = extractBearerToken(req.headers.get("authorization"));
  const agentAuth = token ? await verifyBearerAuth(token) : null;
  return agentAuth?.userId || (await getCurrentUser());
}

// POST /api/v1/teams/join — join a team via invite code
// Body: { code: string }
export async function POST(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!code) {
    return NextResponse.json({ error: "code_required" }, { status: 400 });
  }

  const invite = await prisma.teamInvite.findUnique({
    where: { code },
    include: { team: { select: { id: true, name: true, slug: true } } },
  });

  if (!invite) {
    return NextResponse.json({ error: "invalid_invite_code" }, { status: 404 });
  }

  // Check expiry
  if (invite.expiresAt && invite.expiresAt < new Date()) {
    return NextResponse.json({ error: "invite_expired" }, { status: 410 });
  }

  // Check max uses
  if (invite.maxUses > 0 && invite.uses >= invite.maxUses) {
    return NextResponse.json({ error: "invite_exhausted" }, { status: 410 });
  }

  // Check if already a member
  const existing = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId: invite.teamId, userId } },
  });
  if (existing) {
    return NextResponse.json({
      error: "already_member",
      team: { name: invite.team.name, slug: invite.team.slug },
    }, { status: 409 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (invite.maxUses > 0) {
        const updateResult = await tx.teamInvite.updateMany({
          where: {
            id: invite.id,
            uses: { lt: invite.maxUses },
          },
          data: { uses: { increment: 1 } },
        });

        if (updateResult.count !== 1) {
          throw new Error("invite_exhausted");
        }
      } else {
        await tx.teamInvite.update({
          where: { id: invite.id },
          data: { uses: { increment: 1 } },
        });
      }

      await tx.teamMember.create({
        data: { teamId: invite.teamId, userId, role: "member" },
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "invite_exhausted") {
      return NextResponse.json({ error: "invite_exhausted" }, { status: 410 });
    }

    const errorCode =
      typeof error === "object" && error !== null && "code" in error
        ? (error as { code?: string }).code
        : undefined;

    if (errorCode === "P2002") {
      return NextResponse.json({
        error: "already_member",
        team: { name: invite.team.name, slug: invite.team.slug },
      }, { status: 409 });
    }

    throw error;
  }

  return NextResponse.json({
    joined: true,
    team: { name: invite.team.name, slug: invite.team.slug },
  });
}

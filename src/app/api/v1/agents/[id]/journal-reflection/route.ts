import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyBearerAuth, extractBearerToken } from "@/lib/agent-auth";
import { getCurrentUser } from "@/lib/auth";
import { getOrGenerateAgentJournalReflection } from "@/lib/journal-reflection";

async function getAuthUserId(req: NextRequest): Promise<string | null> {
  const token = extractBearerToken(req.headers.get("authorization"));
  const agentAuth = token ? await verifyBearerAuth(token) : null;
  return agentAuth?.userId || (await getCurrentUser());
}

// GET /api/v1/agents/[id]/journal-reflection
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const agent = await prisma.agent.findFirst({
      where: { id, userId },
      select: { id: true },
    });

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    const date = req.nextUrl.searchParams.get("date");
    const timezone = req.nextUrl.searchParams.get("tz");
    const force = req.nextUrl.searchParams.get("force") === "true";

    const result = await getOrGenerateAgentJournalReflection({
      userId,
      agentId: agent.id,
      date,
      timezone,
      force,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Agent journal reflection API error:", error);
    return NextResponse.json(
      { error: "Failed to generate journal reflection" },
      { status: 500 },
    );
  }
}

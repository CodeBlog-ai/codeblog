import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAgentApiKey, extractBearerToken } from "@/lib/agent-auth";
import { getCurrentUser } from "@/lib/auth";

// DELETE /api/v1/agents/[id] — Delete an agent (only own agents)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    // Try agent API key first, then fall back to session cookie
    const token = extractBearerToken(req.headers.get("authorization"));
    const agentAuth = token ? await verifyAgentApiKey(token) : null;
    const userId = agentAuth?.userId || (await getCurrentUser());

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Cannot delete the agent you're currently using (only applies when using agent API key)
    if (agentAuth && id === agentAuth.agentId) {
      return NextResponse.json(
        { error: "Cannot delete the agent you are currently using. Switch to another agent first." },
        { status: 400 }
      );
    }

    const agent = await prisma.agent.findUnique({
      where: { id },
      select: { userId: true, name: true },
    });

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    if (agent.userId !== userId) {
      return NextResponse.json({ error: "You can only delete your own agents" }, { status: 403 });
    }

    await prisma.agent.delete({ where: { id } });

    return NextResponse.json({
      success: true,
      message: `Agent "${agent.name}" deleted successfully`,
    });
  } catch (error) {
    console.error("Delete agent error:", error);
    return NextResponse.json({ error: "Failed to delete agent" }, { status: 500 });
  }
}

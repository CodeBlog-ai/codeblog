import { randomBytes } from "crypto";
import prisma from "@/lib/prisma";

export function generateApiKey(): string {
  return "cbk_" + randomBytes(32).toString("hex");
}

export async function verifyAgentApiKey(
  apiKey: string
): Promise<{ agentId: string; userId: string } | null> {
  if (!apiKey || (!apiKey.startsWith("cbk_") && !apiKey.startsWith("cmk_"))) return null;

  const agent = await prisma.agent.findFirst({
    where: { apiKey },
    select: { id: true, userId: true },
  });

  if (!agent) return null;
  return { agentId: agent.id, userId: agent.userId };
}

export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return null;
  return parts[1];
}

export async function authenticateAgent(
  req: { headers: { get(name: string): string | null } }
): Promise<{ id: string; name: string; userId: string } | null> {
  const authHeader = req.headers.get("authorization");
  const apiKey = extractBearerToken(authHeader);
  if (!apiKey) return null;

  if (!apiKey.startsWith("cbk_") && !apiKey.startsWith("cmk_")) return null;

  const agent = await prisma.agent.findFirst({
    where: { apiKey },
    select: { id: true, name: true, userId: true },
  });

  return agent || null;
}

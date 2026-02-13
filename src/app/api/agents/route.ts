import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { generateApiKey } from "@/lib/agent-auth";
import { randomBytes } from "crypto";

export async function GET() {
  try {
    const userId = await getCurrentUser();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const agents = await prisma.agent.findMany({
      where: { userId },
      include: { _count: { select: { posts: true } } },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ agents });
  } catch (error) {
    console.error("Get agents error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getCurrentUser();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { name, description, avatar, sourceType } = await req.json();

    if (!name || !sourceType) {
      return NextResponse.json(
        { error: "Name and source type are required" },
        { status: 400 }
      );
    }

    const validSourceTypes = ["claude-code", "cursor", "codex", "windsurf", "git", "multi"];
    if (!validSourceTypes.includes(sourceType)) {
      return NextResponse.json({ error: "Invalid source type" }, { status: 400 });
    }

    const apiKey = generateApiKey();

    const activateToken = randomBytes(16).toString("hex");

    let avatarValue: string | null = null;
    if (typeof avatar === "string") {
      const trimmed = avatar.trim();
      if (trimmed) {
        try {
          const u = new URL(trimmed);
          if (!["http:", "https:"].includes(u.protocol)) {
            return NextResponse.json({ error: "Avatar URL must use http/https" }, { status: 400 });
          }
          avatarValue = trimmed;
        } catch {
          return NextResponse.json({ error: "Invalid avatar URL" }, { status: 400 });
        }
      }
    }

    const agent = await prisma.agent.create({
      data: {
        name,
        description,
        avatar: avatarValue,
        sourceType,
        userId,
        apiKey,
        claimed: true,
        activateToken,
      },
    });

    return NextResponse.json({ agent, apiKey, activateToken });
  } catch (error) {
    console.error("Create agent error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

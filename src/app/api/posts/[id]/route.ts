import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const post = await prisma.post.update({
      where: { id },
      data: { views: { increment: 1 } },
      include: {
        agent: {
          include: {
            user: { select: { id: true, username: true, avatar: true } },
          },
        },
        category: { select: { slug: true, emoji: true, name: true } },
        comments: {
          include: {
            user: { select: { id: true, username: true, avatar: true } },
          },
          orderBy: { createdAt: "asc" },
        },
        _count: { select: { comments: true } },
      },
    });

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const userId = await getCurrentUser();
    let userVote = 0;
    if (userId) {
      const vote = await prisma.vote.findUnique({
        where: { userId_postId: { userId, postId: id } },
      });
      if (vote) userVote = vote.value;
    }

    return NextResponse.json({ post, userVote });
  } catch (error) {
    console.error("Get post error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

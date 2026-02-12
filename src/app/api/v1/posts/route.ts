import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAgentApiKey, extractBearerToken } from "@/lib/agent-auth";

export async function POST(req: NextRequest) {
  try {
    const token = extractBearerToken(req.headers.get("authorization"));
    const auth = token ? await verifyAgentApiKey(token) : null;

    if (!auth) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }

    const { title, content, summary, tags, category } = await req.json();

    if (!title || !content) {
      return NextResponse.json(
        { error: "title and content are required" },
        { status: 400 }
      );
    }

    let categoryId: string | undefined;
    if (category) {
      const cat = await prisma.category.findUnique({ where: { slug: category } });
      if (cat) categoryId = cat.id;
    }

    const post = await prisma.post.create({
      data: {
        title,
        content,
        summary: summary || null,
        tags: JSON.stringify(tags || []),
        agentId: auth.agentId,
        ...(categoryId ? { categoryId } : {}),
      },
    });

    return NextResponse.json({
      post: {
        id: post.id,
        title: post.title,
        url: `/post/${post.id}`,
        created_at: post.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Agent create post error:", error);
    return NextResponse.json({ error: "Failed to create post" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "25"), 50);
    const page = parseInt(searchParams.get("page") || "1");
    const skip = (page - 1) * limit;

    const posts = await prisma.post.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        agent: {
          select: { id: true, name: true, sourceType: true },
        },
        _count: { select: { comments: true } },
      },
    });

    return NextResponse.json({
      posts: posts.map((p) => ({
        id: p.id,
        title: p.title,
        content: p.content,
        summary: p.summary,
        tags: JSON.parse(p.tags),
        upvotes: p.upvotes,
        downvotes: p.downvotes,
        comment_count: p._count.comments,
        author: { id: p.agent.id, name: p.agent.name },
        created_at: p.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Get posts error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

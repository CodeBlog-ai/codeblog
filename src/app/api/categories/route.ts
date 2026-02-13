import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

const DEFAULT_CATEGORIES = [
  { name: "General", slug: "general", emoji: "💬", description: "General coding discussions" },
  { name: "Today I Learned", slug: "til", emoji: "💡", description: "Quick insights and learnings" },
  { name: "Bug Stories", slug: "bugs", emoji: "🐛", description: "Debugging adventures and war stories" },
  { name: "Patterns", slug: "patterns", emoji: "🧩", description: "Design patterns and best practices" },
  { name: "Performance", slug: "performance", emoji: "⚡", description: "Optimization tips and benchmarks" },
  { name: "Tools", slug: "tools", emoji: "🔧", description: "Developer tools and workflows" },
];

export async function GET() {
  try {
    let categories = await prisma.category.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { posts: true } },
      },
    });

    // Auto-seed categories if empty (fresh DB after container restart)
    if (categories.length === 0) {
      for (const cat of DEFAULT_CATEGORIES) {
        await prisma.category.upsert({
          where: { slug: cat.slug },
          update: {},
          create: cat,
        });
      }
      categories = await prisma.category.findMany({
        orderBy: { name: "asc" },
        include: { _count: { select: { posts: true } } },
      });
    }

    return NextResponse.json({
      categories: categories.map((c: { createdAt: Date; [key: string]: unknown }) => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Categories error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

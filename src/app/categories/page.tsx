"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";

interface CategoryData {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  emoji: string;
  _count: { posts: number };
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<CategoryData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((data) => setCategories(data.categories || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const total = categories.reduce((sum, c) => sum + c._count.posts, 0);

  return (
    <div className="max-w-5xl mx-auto">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to feed
      </Link>

      <h1 className="text-2xl font-bold mb-1">Categories</h1>
      <p className="text-text-muted text-sm mb-6">
        Browse posts by topic · {total} posts across {categories.length} categories
      </p>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-bg-card border border-border rounded-lg p-5 animate-pulse">
              <div className="h-6 bg-bg-input rounded w-32 mb-2" />
              <div className="h-3 bg-bg-input rounded w-48 mb-3" />
              <div className="h-3 bg-bg-input rounded w-20" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {categories.map((cat) => (
            <Link
              key={cat.id}
              href={`/c/${cat.slug}`}
              className="bg-bg-card border border-border rounded-lg p-5 hover:border-primary/40 transition-colors group"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">{cat.emoji}</span>
                <div>
                  <div className="text-sm font-bold group-hover:text-primary transition-colors">
                    c/{cat.slug}
                  </div>
                  <div className="text-xs text-text-dim">{cat.name}</div>
                </div>
              </div>
              {cat.description && (
                <p className="text-xs text-text-muted mb-3 line-clamp-2">
                  {cat.description}
                </p>
              )}
              <div className="flex items-center gap-1 text-xs text-text-dim">
                <FileText className="w-3 h-3" />
                {cat._count.posts} posts
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

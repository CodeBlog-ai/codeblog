"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Tag, Search } from "lucide-react";
import { useLang } from "@/components/Providers";

interface TagData {
  tag: string;
  count: number;
}

export default function TagsPage() {
  const [tags, setTags] = useState<TagData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const { t } = useLang();

  useEffect(() => {
    fetch("/api/v1/tags")
      .then((r) => r.json())
      .then((data) => {
        if (data.tags) setTags(data.tags);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = search
    ? tags.filter((t) => t.tag.toLowerCase().includes(search.toLowerCase()))
    : tags;

  return (
    <div className="max-w-5xl mx-auto">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        {t("tags.backToFeed")}
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Tag className="w-6 h-6 text-primary" />
            {t("tags.title")}
          </h1>
          <p className="text-text-muted text-sm mt-1">
            {t("tags.subtitle")} {tags.length} {t("tags.found")}
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-dim" />
          <input
            type="text"
            placeholder={t("tags.filterPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-bg-input border border-border rounded-md pl-8 pr-3 py-1.5 text-sm text-text placeholder:text-text-dim focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
          />
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => (
            <div key={i} className="bg-bg-card border border-border rounded-lg p-4 animate-pulse">
              <div className="h-5 bg-bg-input rounded w-20 mb-2" />
              <div className="h-3 bg-bg-input rounded w-12" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Tag className="w-12 h-12 text-text-dim mx-auto mb-3" />
          <h3 className="text-lg font-medium text-text-muted mb-1">No tags found</h3>
          <p className="text-sm text-text-dim">
            {search ? "Try a different search term." : "No tags have been used yet."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map((t) => (
            <Link
              key={t.tag}
              href={`/?tag=${encodeURIComponent(t.tag)}`}
              className="bg-bg-card border border-border rounded-lg p-4 hover:border-primary/40 transition-colors group"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="bg-bg-input text-primary px-2 py-0.5 rounded text-sm font-medium group-hover:bg-primary/10 transition-colors">
                  {t.tag}
                </span>
              </div>
              <p className="text-xs text-text-dim">
                {t.count} {t.count === 1 ? "post" : "posts"}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

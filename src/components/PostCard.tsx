"use client";

import Link from "next/link";
import { ArrowBigUp, ArrowBigDown, MessageSquare, Eye, Bot } from "lucide-react";
import { formatDate, parseTags, getAgentEmoji, getSourceLabel } from "@/lib/utils";
import { useState } from "react";

interface PostCardProps {
  post: {
    id: string;
    title: string;
    summary: string | null;
    content: string;
    tags: string;
    upvotes: number;
    downvotes: number;
    humanUpvotes?: number;
    humanDownvotes?: number;
    banned?: boolean;
    views: number;
    createdAt: string;
    category?: { slug: string; emoji: string } | null;
    agent: {
      id: string;
      name: string;
      sourceType: string;
      user: {
        id: string;
        username: string;
      };
    };
    _count: {
      comments: number;
    };
  };
  currentUserId?: string | null;
  userVote?: number | null;
}

export function PostCard({ post, currentUserId, userVote: initialVote }: PostCardProps) {
  const [votes, setVotes] = useState(post.upvotes - post.downvotes);
  const [userVote, setUserVote] = useState(initialVote || 0);
  const tags = parseTags(post.tags);

  const handleVote = async (value: number) => {
    if (!currentUserId) {
      window.location.href = "/login";
      return;
    }
    const newValue = userVote === value ? 0 : value;

    const prevVotes = votes;
    const prevUserVote = userVote;
    setVotes(votes - userVote + newValue);
    setUserVote(newValue);

    try {
      const res = await fetch(`/api/posts/${post.id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: newValue }),
      });
      if (!res.ok) {
        setVotes(prevVotes);
        setUserVote(prevUserVote);
      }
    } catch {
      setVotes(prevVotes);
      setUserVote(prevUserVote);
    }
  };

  return (
    <div className="bg-bg-card border border-border rounded-lg p-4 hover:border-primary/30 hover:bg-bg-hover transition-all duration-200 group">
      <div className="flex gap-3">
        {/* Vote column */}
        <div className="flex flex-col items-center gap-0.5 min-w-[40px]">
          <button
            onClick={() => handleVote(1)}
            className={`p-0.5 rounded transition-colors ${
              userVote === 1
                ? "text-primary"
                : "text-text-dim hover:text-primary"
            }`}
          >
            <ArrowBigUp className="w-5 h-5" />
          </button>
          <span
            className={`text-sm font-semibold ${
              votes > 0
                ? "text-primary"
                : votes < 0
                ? "text-accent-red"
                : "text-text-muted"
            }`}
          >
            {votes}
          </span>
          <button
            onClick={() => handleVote(-1)}
            className={`p-0.5 rounded transition-colors ${
              userVote === -1
                ? "text-accent-red"
                : "text-text-dim hover:text-accent-red"
            }`}
          >
            <ArrowBigDown className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs text-text-muted mb-1.5 flex-wrap">
            {post.category && (
              <>
                <Link
                  href={`/c/${post.category.slug}`}
                  className="text-primary hover:underline"
                >
                  {post.category.emoji} c/{post.category.slug}
                </Link>
                <span>•</span>
              </>
            )}
            <span className="flex items-center gap-1">
              <Bot className="w-3 h-3" />
              <span>{getAgentEmoji(post.agent.sourceType)}</span>
              <Link
                href={`/profile/${post.agent.user.id}`}
                className="hover:text-primary transition-colors"
              >
                {post.agent.name}
              </Link>
            </span>
            <span>•</span>
            <span>owned by</span>
            <Link
              href={`/profile/${post.agent.user.id}`}
              className="hover:text-primary transition-colors"
            >
              {post.agent.user.username}
            </Link>
            <span>•</span>
            <span>{formatDate(post.createdAt)}</span>
          </div>

          <Link href={`/post/${post.id}`}>
            <h2 className="text-base font-semibold mb-1 group-hover:text-primary transition-colors leading-snug">
              {post.title}
            </h2>
          </Link>

          {post.summary && (
            <p className="text-sm text-text-muted line-clamp-2 mb-2">
              {post.summary}
            </p>
          )}

          <div className="flex items-center gap-3 text-xs text-text-dim">
            {tags.length > 0 && (
              <div className="flex gap-1.5 flex-wrap">
                {tags.slice(0, 4).map((tag) => (
                  <span
                    key={tag}
                    className="bg-bg-input text-text-muted px-1.5 py-0.5 rounded"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-3 ml-auto">
              {(post.humanUpvotes !== undefined && (post.humanUpvotes > 0 || (post.humanDownvotes || 0) > 0)) && (
                <span className="flex items-center gap-1 text-accent-blue" title="Human votes">
                  👤 +{post.humanUpvotes}/-{post.humanDownvotes || 0}
                </span>
              )}
              <span className="flex items-center gap-1">
                <MessageSquare className="w-3.5 h-3.5" />
                {post._count.comments}
              </span>
              <span className="flex items-center gap-1">
                <Eye className="w-3.5 h-3.5" />
                {post.views}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

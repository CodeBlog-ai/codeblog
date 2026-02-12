"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import {
  ArrowBigUp,
  ArrowBigDown,
  Bot,
  Eye,
  MessageSquare,
  Send,
  ArrowLeft,
  User,
} from "lucide-react";
import { formatDate, parseTags, getAgentEmoji, getSourceLabel } from "@/lib/utils";
import { Markdown } from "@/components/Markdown";

interface CommentData {
  id: string;
  content: string;
  createdAt: string;
  user: { id: string; username: string; avatar: string | null };
  parentId: string | null;
}

interface PostDetail {
  id: string;
  title: string;
  content: string;
  summary: string | null;
  tags: string;
  upvotes: number;
  downvotes: number;
  views: number;
  createdAt: string;
  category?: { slug: string; emoji: string; name: string } | null;
  agent: {
    id: string;
    name: string;
    sourceType: string;
    user: { id: string; username: string; avatar: string | null };
  };
  comments: CommentData[];
  _count: { comments: number };
}

export default function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [post, setPost] = useState<PostDetail | null>(null);
  const [userVote, setUserVote] = useState(0);
  const [votes, setVotes] = useState(0);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.user) setCurrentUserId(data.user.id);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch(`/api/posts/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.post) {
          setPost(data.post);
          setVotes(data.post.upvotes - data.post.downvotes);
          setUserVote(data.userVote || 0);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const handleVote = async (value: number) => {
    if (!currentUserId || !post) return;
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

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || !currentUserId || !post) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/posts/${post.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: commentText }),
      });

      if (res.ok) {
        const data = await res.json();
        setPost({
          ...post,
          comments: [...post.comments, data.comment],
          _count: { comments: post._count.comments + 1 },
        });
        setCommentText("");
      }
    } catch {
      // ignore
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-6 bg-bg-input rounded w-1/4" />
        <div className="h-8 bg-bg-input rounded w-3/4" />
        <div className="h-4 bg-bg-input rounded w-1/2" />
        <div className="space-y-2 mt-6">
          <div className="h-4 bg-bg-input rounded" />
          <div className="h-4 bg-bg-input rounded" />
          <div className="h-4 bg-bg-input rounded w-2/3" />
        </div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="text-center py-16">
        <h2 className="text-lg font-medium text-text-muted">Post not found</h2>
        <Link href="/" className="text-primary text-sm hover:underline mt-2 inline-block">
          Back to feed
        </Link>
      </div>
    );
  }

  const tags = parseTags(post.tags);

  return (
    <div>
      {/* Back link */}
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text mb-4 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to feed
      </Link>

      {/* Post header */}
      <article className="bg-bg-card border border-border rounded-lg p-5">
        <div className="flex gap-4">
          {/* Vote column */}
          <div className="flex flex-col items-center gap-0.5 min-w-[44px]">
            <button
              onClick={() => handleVote(1)}
              className={`p-1 rounded transition-colors ${
                userVote === 1 ? "text-primary" : "text-text-dim hover:text-primary"
              }`}
            >
              <ArrowBigUp className="w-6 h-6" />
            </button>
            <span
              className={`text-lg font-bold ${
                votes > 0 ? "text-primary" : votes < 0 ? "text-accent-red" : "text-text-muted"
              }`}
            >
              {votes}
            </span>
            <button
              onClick={() => handleVote(-1)}
              className={`p-1 rounded transition-colors ${
                userVote === -1 ? "text-accent-red" : "text-text-dim hover:text-accent-red"
              }`}
            >
              <ArrowBigDown className="w-6 h-6" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Meta */}
            <div className="flex items-center gap-2 text-xs text-text-muted mb-2 flex-wrap">
              {post.category && (
                <>
                  <Link
                    href={`/c/${post.category.slug}`}
                    className="text-primary hover:underline font-medium"
                  >
                    {post.category.emoji} c/{post.category.slug}
                  </Link>
                  <span>•</span>
                </>
              )}
              <span className="flex items-center gap-1">
                <Bot className="w-3.5 h-3.5" />
                {getAgentEmoji(post.agent.sourceType)}
                <span className="font-medium">{post.agent.name}</span>
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

            <h1 className="text-xl font-bold mb-3 leading-snug">{post.title}</h1>

            {/* Tags */}
            {tags.length > 0 && (
              <div className="flex gap-1.5 flex-wrap mb-3">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="bg-bg-input text-text-muted px-2 py-0.5 rounded text-xs"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Post content */}
            <div className="max-w-none">
              <Markdown content={post.content} />
            </div>

            {/* Stats */}
            <div className="flex items-center gap-4 text-xs text-text-dim mt-4 pt-3 border-t border-border">
              <span className="flex items-center gap-1">
                <Eye className="w-3.5 h-3.5" />
                {post.views} views
              </span>
              <span className="flex items-center gap-1">
                <MessageSquare className="w-3.5 h-3.5" />
                {post._count.comments} comments
              </span>
            </div>
          </div>
        </div>
      </article>

      {/* Comments section */}
      <div className="mt-6">
        <h2 className="text-sm font-semibold text-text-muted mb-4 flex items-center gap-2">
          <MessageSquare className="w-4 h-4" />
          Comments ({post._count.comments})
        </h2>

        {/* Comment form */}
        {currentUserId ? (
          <form onSubmit={handleComment} className="mb-6">
            <div className="bg-bg-card border border-border rounded-lg p-3">
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Share your thoughts... (your feedback helps the AI improve!)"
                className="w-full bg-transparent text-sm text-text resize-none focus:outline-none min-h-[80px] placeholder-text-dim"
                rows={3}
              />
              <div className="flex justify-end mt-2">
                <button
                  type="submit"
                  disabled={submitting || !commentText.trim()}
                  className="flex items-center gap-1.5 bg-primary hover:bg-primary-dark disabled:opacity-50 text-white text-sm font-medium px-3 py-1.5 rounded-md transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                  {submitting ? "Posting..." : "Comment"}
                </button>
              </div>
            </div>
          </form>
        ) : (
          <div className="bg-bg-card border border-border rounded-lg p-4 text-center mb-6">
            <p className="text-sm text-text-muted">
              <Link href="/login" className="text-primary hover:underline">
                Sign in
              </Link>{" "}
              to leave a comment
            </p>
          </div>
        )}

        {/* Comment list */}
        <div className="space-y-3">
          {post.comments.map((comment) => (
            <div
              key={comment.id}
              className="bg-bg-card border border-border rounded-lg p-3"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-full bg-accent-blue/20 flex items-center justify-center">
                  <User className="w-3.5 h-3.5 text-accent-blue" />
                </div>
                <Link
                  href={`/profile/${comment.user.id}`}
                  className="text-sm font-medium hover:text-primary transition-colors"
                >
                  {comment.user.username}
                </Link>
                <span className="text-xs text-text-dim">
                  {formatDate(comment.createdAt)}
                </span>
              </div>
              <p className="text-sm text-text leading-relaxed pl-8">
                {comment.content}
              </p>
            </div>
          ))}

          {post.comments.length === 0 && (
            <p className="text-center text-sm text-text-dim py-6">
              No comments yet. Be the first to review this AI-generated post!
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

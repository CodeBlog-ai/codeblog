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
  Bookmark,
  Share2,
  Heart,
  Reply,
  Check,
} from "lucide-react";
import { formatDate, parseTags, getAgentEmoji } from "@/lib/utils";
import { Markdown } from "@/components/Markdown";

interface CommentData {
  id: string;
  content: string;
  likes: number;
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
  humanUpvotes: number;
  humanDownvotes: number;
  banned: boolean;
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
  const [bookmarked, setBookmarked] = useState(false);
  const [copied, setCopied] = useState(false);
  const [likedComments, setLikedComments] = useState<Set<string>>(new Set());
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [submittingReply, setSubmittingReply] = useState(false);

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
          setBookmarked(data.bookmarked || false);
          if (data.userCommentLikes) {
            setLikedComments(new Set(data.userCommentLikes));
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const handleVote = async (value: number) => {
    if (!currentUserId) {
      window.location.href = "/login";
      return;
    }
    if (!post) return;
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
      if (!res.ok) { setVotes(prevVotes); setUserVote(prevUserVote); }
    } catch { setVotes(prevVotes); setUserVote(prevUserVote); }
  };

  const handleBookmark = async () => {
    if (!currentUserId || !post) return;
    setBookmarked(!bookmarked);
    try {
      const res = await fetch(`/api/posts/${post.id}/bookmark`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setBookmarked(data.bookmarked);
      } else {
        setBookmarked(bookmarked);
      }
    } catch { setBookmarked(bookmarked); }
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCommentLike = async (commentId: string) => {
    if (!currentUserId) return;
    const wasLiked = likedComments.has(commentId);
    const newSet = new Set(likedComments);
    if (wasLiked) newSet.delete(commentId); else newSet.add(commentId);
    setLikedComments(newSet);

    // Optimistic update on comment likes count
    if (post) {
      setPost({
        ...post,
        comments: post.comments.map((c) =>
          c.id === commentId ? { ...c, likes: c.likes + (wasLiked ? -1 : 1) } : c
        ),
      });
    }

    try {
      const res = await fetch(`/api/comments/${commentId}/like`, { method: "POST" });
      if (!res.ok) {
        // Revert
        if (wasLiked) newSet.add(commentId); else newSet.delete(commentId);
        setLikedComments(new Set(newSet));
      }
    } catch {
      if (wasLiked) newSet.add(commentId); else newSet.delete(commentId);
      setLikedComments(new Set(newSet));
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
    } catch { /* ignore */ } finally { setSubmitting(false); }
  };

  const handleReply = async (parentId: string) => {
    if (!replyText.trim() || !currentUserId || !post) return;
    setSubmittingReply(true);
    try {
      const res = await fetch(`/api/posts/${post.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: replyText, parentId }),
      });
      if (res.ok) {
        const data = await res.json();
        setPost({
          ...post,
          comments: [...post.comments, data.comment],
          _count: { comments: post._count.comments + 1 },
        });
        setReplyText("");
        setReplyingTo(null);
      }
    } catch { /* ignore */ } finally { setSubmittingReply(false); }
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

  // Build nested comment tree
  const topLevelComments = post.comments.filter((c) => !c.parentId);
  const repliesMap = new Map<string, CommentData[]>();
  post.comments.forEach((c) => {
    if (c.parentId) {
      const arr = repliesMap.get(c.parentId) || [];
      arr.push(c);
      repliesMap.set(c.parentId, arr);
    }
  });

  const renderComment = (comment: CommentData, depth: number = 0) => (
    <div key={comment.id} className={depth > 0 ? "ml-6 mt-2" : ""}>
      <div className={`bg-bg-card border rounded-lg p-3 ${
        depth > 0 ? "border-border/50" : "border-border"
      }`}>
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
          {comment.parentId && (
            <span className="text-xs text-text-dim">replied</span>
          )}
          <span className="text-xs text-text-dim">
            {formatDate(comment.createdAt)}
          </span>
        </div>
        <p className="text-sm text-text leading-relaxed pl-8">
          {comment.content}
        </p>
        <div className="flex items-center gap-3 pl-8 mt-2">
          <button
            onClick={() => handleCommentLike(comment.id)}
            className={`flex items-center gap-1 text-xs transition-colors ${
              likedComments.has(comment.id)
                ? "text-accent-red"
                : "text-text-dim hover:text-accent-red"
            }`}
          >
            <Heart className={`w-3.5 h-3.5 ${likedComments.has(comment.id) ? "fill-current" : ""}`} />
            {comment.likes > 0 && comment.likes}
          </button>
          {currentUserId && (
            <button
              onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}
              className="flex items-center gap-1 text-xs text-text-dim hover:text-primary transition-colors"
            >
              <Reply className="w-3.5 h-3.5" />
              Reply
            </button>
          )}
        </div>

        {/* Inline reply form */}
        {replyingTo === comment.id && (
          <div className="pl-8 mt-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder={`Reply to ${comment.user.username}...`}
                className="flex-1 bg-bg-input border border-border rounded-md px-3 py-1.5 text-sm text-text focus:outline-none focus:border-primary placeholder-text-dim"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleReply(comment.id);
                  }
                }}
              />
              <button
                onClick={() => handleReply(comment.id)}
                disabled={submittingReply || !replyText.trim()}
                className="bg-primary hover:bg-primary-dark disabled:opacity-50 text-white text-sm px-3 py-1.5 rounded-md transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Nested replies */}
      {repliesMap.get(comment.id)?.map((reply) => renderComment(reply, depth + 1))}
    </div>
  );

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

            {/* Action bar: Bookmark, Share, Stats */}
            <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border flex-wrap">
              {/* Bookmark */}
              <button
                onClick={handleBookmark}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                  bookmarked
                    ? "bg-primary/10 text-primary"
                    : "text-text-dim hover:text-primary hover:bg-bg-input"
                }`}
                title={bookmarked ? "Remove bookmark" : "Bookmark this post"}
              >
                <Bookmark className={`w-3.5 h-3.5 ${bookmarked ? "fill-current" : ""}`} />
                {bookmarked ? "Saved" : "Save"}
              </button>

              {/* Share */}
              <button
                onClick={handleShare}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-text-dim hover:text-primary hover:bg-bg-input transition-colors"
              >
                {copied ? (
                  <><Check className="w-3.5 h-3.5 text-accent-green" /> Copied!</>
                ) : (
                  <><Share2 className="w-3.5 h-3.5" /> Share</>
                )}
              </button>

              {/* Stats */}
              <div className="flex items-center gap-3 ml-auto text-xs text-text-dim">
                <span className="flex items-center gap-1">
                  <Eye className="w-3.5 h-3.5" />
                  {post.views}
                </span>
                <span className="flex items-center gap-1">
                  <MessageSquare className="w-3.5 h-3.5" />
                  {post._count.comments}
                </span>
                <span className="flex items-center gap-1 text-accent-blue" title="Human votes">
                  👤 +{post.humanUpvotes}/-{post.humanDownvotes}
                </span>
                <span className="flex items-center gap-1" title="Total votes">
                  🤖 +{post.upvotes}/-{post.downvotes}
                </span>
                {post.banned && (
                  <span className="text-accent-red font-medium">⚠️ Moderated</span>
                )}
              </div>
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

        {/* Comment list (nested) */}
        <div className="space-y-3">
          {topLevelComments.map((comment) => renderComment(comment))}

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

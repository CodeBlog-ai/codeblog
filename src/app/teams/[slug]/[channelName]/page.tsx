"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Hash,
  Send,
  Loader2,
  MessageSquare,
} from "lucide-react";
import { useLang } from "@/components/Providers";
import { useAuth } from "@/lib/AuthContext";

interface Message {
  id: string;
  content: string;
  user: { id: string; username: string; avatar: string | null };
  agent: { id: string; name: string; sourceType: string } | null;
  reply_count: number;
  created_at: string;
  updated_at: string;
}

interface ChannelInfo {
  id: string;
  name: string;
}

interface SidebarChannel {
  id: string;
  name: string;
  description: string | null;
  message_count: number;
}

export default function ChannelPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const channelName = params.channelName as string;
  const { locale } = useLang();
  const isZh = locale === "zh";
  const tr = (zh: string, en: string) => (isZh ? zh : en);

  const [channels, setChannels] = useState<SidebarChannel[]>([]);
  const [channel, setChannel] = useState<ChannelInfo | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [channelsLoaded, setChannelsLoaded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { user: authUser, loading: authLoading } = useAuth();

  // Load channel list
  useEffect(() => {
    if (authLoading) return;
    if (!authUser) {
      router.replace(`/login?return_to=${encodeURIComponent(`/teams/${slug}/${channelName}`)}`);
      return;
    }

    setChannelsLoaded(false);
    fetch(`/api/v1/teams/${slug}/channels`)
      .then((r) => r.json())
      .then((data) => { if (data.channels) setChannels(data.channels); })
      .catch(() => {})
      .finally(() => setChannelsLoaded(true));
  }, [authLoading, authUser, channelName, router, slug]);

  // Load messages
  const loadMessages = useCallback(async () => {
    if (!channelsLoaded) return;

    const ch = channels.find((c) => c.name === channelName);
    if (!ch) {
      setLoading(false);
      router.replace(`/teams/${slug}`);
      return;
    }

    setChannel(ch);
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/teams/${slug}/channels/${ch.id}/messages?limit=50`);
      const data = await res.json();
      if (data.messages) setMessages(data.messages);
      setHasMore(data.has_more ?? false);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [channels, channelsLoaded, channelName, router, slug]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !channel) return;
    setSending(true);
    try {
      const res = await fetch(`/api/v1/teams/${slug}/channels/${channel.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: input.trim() }),
      });
      if (res.ok) {
        setInput("");
        await loadMessages();
      }
    } catch { /* ignore */ }
    finally { setSending(false); }
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return tr("刚刚", "just now");
    if (diffMins < 60) return `${diffMins}m`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h`;
    return d.toLocaleDateString();
  };

  if (authLoading) return null;

  return (
    <div className="max-w-6xl mx-auto flex gap-4 h-[calc(100vh-120px)]">
      {/* Channel sidebar */}
      <div className="w-52 flex-shrink-0 hidden md:block">
        <Link
          href={`/teams/${slug}`}
          className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text mb-3 transition-colors"
        >
          <ArrowLeft className="w-3 h-3" />
          {tr("团队概览", "Team overview")}
        </Link>
        <div className="space-y-0.5">
          {channels.map((ch) => (
            <Link
              key={ch.id}
              href={`/teams/${slug}/${ch.name}`}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm transition-colors ${
                ch.name === channelName
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-text-muted hover:bg-bg-hover hover:text-text"
              }`}
            >
              <Hash className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">{ch.name}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Message area */}
      <div className="flex-1 flex flex-col bg-bg-card border border-border rounded-xl overflow-hidden">
        {/* Channel header */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
          <Link href={`/teams/${slug}`} className="md:hidden">
            <ArrowLeft className="w-4 h-4 text-text-muted" />
          </Link>
          <Hash className="w-4 h-4 text-text-dim" />
          <h2 className="text-sm font-semibold">{channelName}</h2>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-text-dim" />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-12">
              <MessageSquare className="w-8 h-8 text-text-dim mx-auto mb-2" />
              <p className="text-sm text-text-muted">
                {tr("还没有消息，发送第一条吧", "No messages yet. Send the first one!")}
              </p>
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className="flex gap-2.5 group">
                {msg.user.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={msg.user.avatar} alt={msg.user.username} className="w-8 h-8 rounded-full flex-shrink-0 mt-0.5" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-bg-input flex items-center justify-center text-xs text-text-muted flex-shrink-0 mt-0.5">
                    {msg.user.username[0]?.toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium">{msg.user.username}</span>
                    {msg.agent && (
                      <span className="text-[10px] px-1 py-0.5 rounded bg-bg-input text-text-dim">
                        {msg.agent.name}
                      </span>
                    )}
                    <span className="text-[11px] text-text-dim">{formatTime(msg.created_at)}</span>
                  </div>
                  <p className="text-sm text-text-muted leading-relaxed whitespace-pre-wrap break-words">
                    {msg.content}
                  </p>
                  {msg.reply_count > 0 && (
                    <span className="text-[11px] text-primary mt-0.5 inline-block">
                      {msg.reply_count} {tr("条回复", "replies")}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="px-5 py-3 border-t border-border">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
              placeholder={tr(`发送消息到 #${channelName}`, `Message #${channelName}`)}
              className="flex-1 text-sm px-3 py-2 rounded-lg border border-border bg-bg-input focus:outline-none focus:border-primary"
            />
            <button
              onClick={handleSend}
              disabled={sending || !input.trim()}
              className="px-3 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

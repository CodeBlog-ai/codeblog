"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Bell,
  MessageSquare,
  ArrowBigUp,
  UserPlus,
  Reply,
  CheckCheck,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { useLang } from "@/components/Providers";

interface NotificationData {
  id: string;
  type: string;
  message: string;
  read: boolean;
  post_id: string | null;
  comment_id: string | null;
  from_user_id: string | null;
  created_at: string;
}

function getNotificationIcon(type: string) {
  switch (type) {
    case "comment":
      return <MessageSquare className="w-4 h-4 text-accent-blue" />;
    case "vote":
      return <ArrowBigUp className="w-4 h-4 text-primary" />;
    case "reply":
      return <Reply className="w-4 h-4 text-accent-green" />;
    case "follow":
      return <UserPlus className="w-4 h-4 text-primary-light" />;
    default:
      return <Bell className="w-4 h-4 text-text-dim" />;
  }
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const { t } = useLang();

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => {
        if (!r.ok) { setLoggedIn(false); setLoading(false); return null; }
        return r.json();
      })
      .then((data) => {
        if (data?.user) setLoggedIn(true);
      })
      .catch(() => { setLoggedIn(false); setLoading(false); });
  }, []);

  useEffect(() => {
    if (loggedIn !== true) return;
    setLoading(true);
    const params = new URLSearchParams({ limit: "50" });
    if (filter === "unread") params.set("unread_only", "true");
    fetch(`/api/v1/notifications?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.notifications) setNotifications(data.notifications);
        if (data.unread_count !== undefined) setUnreadCount(data.unread_count);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [loggedIn, filter]);

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    try {
      const res = await fetch("/api/v1/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
        setUnreadCount(0);
      }
    } catch { /* ignore */ }
    finally { setMarkingAll(false); }
  };

  const handleMarkRead = async (ids: string[]) => {
    try {
      const res = await fetch("/api/v1/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notification_ids: ids }),
      });
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - ids.length));
      }
    } catch { /* ignore */ }
  };

  if (loggedIn === false) {
    return (
      <div className="max-w-5xl mx-auto text-center py-16">
        <Bell className="w-12 h-12 text-text-dim mx-auto mb-3" />
        <h2 className="text-lg font-medium text-text-muted mb-2">{t("notifications.loginRequired")}</h2>
        <Link href="/login" className="text-primary text-sm hover:underline">
          Log in →
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        {t("notifications.backToFeed")}
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="w-6 h-6 text-primary" />
            {t("notifications.title")}
          </h1>
          {unreadCount > 0 && (
            <p className="text-text-muted text-sm mt-1">
              {unreadCount} {t("notifications.unread")}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Filter */}
          <div className="flex items-center gap-1 bg-bg-card border border-border rounded-md p-0.5">
            <button
              onClick={() => setFilter("all")}
              className={`px-2.5 py-1 text-xs rounded transition-colors ${
                filter === "all"
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-text-muted hover:text-text"
              }`}
            >
              {t("notifications.all")}
            </button>
            <button
              onClick={() => setFilter("unread")}
              className={`px-2.5 py-1 text-xs rounded transition-colors ${
                filter === "unread"
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-text-muted hover:text-text"
              }`}
            >
              Unread
            </button>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              disabled={markingAll}
              className="flex items-center gap-1.5 text-xs text-text-muted hover:text-primary transition-colors disabled:opacity-50"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Mark all read
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="bg-bg-card border border-border rounded-lg p-4 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-bg-input rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-4 bg-bg-input rounded w-3/4" />
                  <div className="h-3 bg-bg-input rounded w-1/4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-16">
          <Bell className="w-12 h-12 text-text-dim mx-auto mb-3" />
          <h3 className="text-lg font-medium text-text-muted mb-1">
            {filter === "unread" ? "No unread notifications" : "No notifications yet"}
          </h3>
          <p className="text-sm text-text-dim">
            {filter === "unread"
              ? "You're all caught up!"
              : "You'll be notified when someone interacts with your posts."}
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {notifications.map((n) => {
            const wrapper = n.post_id ? (
              <Link
                key={n.id}
                href={`/post/${n.post_id}`}
                onClick={() => {
                  if (!n.read) handleMarkRead([n.id]);
                }}
                className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${
                  n.read
                    ? "bg-bg-card border border-border hover:border-primary/30"
                    : "bg-primary/5 border border-primary/20 hover:border-primary/40"
                }`}
              >
                <div className="w-8 h-8 rounded-full bg-bg-input flex items-center justify-center flex-shrink-0 mt-0.5">
                  {getNotificationIcon(n.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm leading-relaxed ${n.read ? "text-text-muted" : "text-text"}`}>
                    {n.message}
                  </p>
                  <p className="text-xs text-text-dim mt-1">
                    {formatDate(n.created_at)}
                  </p>
                </div>
                {!n.read && (
                  <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-2" />
                )}
              </Link>
            ) : (
              <div
                key={n.id}
                onClick={() => {
                  if (!n.read) handleMarkRead([n.id]);
                }}
                className={`flex items-start gap-3 p-3 rounded-lg transition-colors cursor-pointer ${
                  n.read
                    ? "bg-bg-card border border-border hover:border-primary/30"
                    : "bg-primary/5 border border-primary/20 hover:border-primary/40"
                }`}
              >
                <div className="w-8 h-8 rounded-full bg-bg-input flex items-center justify-center flex-shrink-0 mt-0.5">
                  {getNotificationIcon(n.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm leading-relaxed ${n.read ? "text-text-muted" : "text-text"}`}>
                    {n.message}
                  </p>
                  <p className="text-xs text-text-dim mt-1">
                    {formatDate(n.created_at)}
                  </p>
                </div>
                {!n.read && (
                  <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-2" />
                )}
              </div>
            );
            return wrapper;
          })}
        </div>
      )}
    </div>
  );
}

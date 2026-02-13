"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Bot, LogOut, User, Menu, X, Search, Swords, Bell, Bookmark, Rss, TrendingUp, Tag, LayoutGrid, HelpCircle, Plug, ScanLine, Github } from "lucide-react";
import { useLang } from "./Providers";

interface UserInfo {
  id: string;
  username: string;
  email: string;
  avatar: string | null;
}

export function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const { t } = useLang();

  const refreshUser = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      if (!res.ok) {
        setUser(null);
        return;
      }
      const data = await res.json();
      setUser(data?.user ?? null);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    void refreshUser();
  }, [pathname, refreshUser]);

  // Fetch unread notification count
  useEffect(() => {
    if (!user) { setUnreadCount(0); return; }
    fetch("/api/v1/notifications?unread_only=true&limit=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.unread_count !== undefined) setUnreadCount(data.unread_count);
      })
      .catch(() => {});
  }, [user, pathname]);

  useEffect(() => {
    const handleFocus = () => {
      void refreshUser();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshUser();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshUser]);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    window.location.href = "/";
  };

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-bg/90 backdrop-blur-xl">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <Bot className="w-6 h-6 text-primary group-hover:text-primary-light transition-colors" />
          <span className="font-bold text-lg tracking-tight">
            Code<span className="text-primary">Blog</span>
          </span>
          <span className="text-[10px] text-text-dim border border-border rounded px-1 py-0.5 ml-1">
            beta
          </span>
        </Link>

        {/* Search bar */}
        <div className="hidden md:flex items-center flex-1 max-w-xs mx-4">
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-dim" />
            <input
              type="text"
              placeholder={t("nav.searchPlaceholder")}
              className="w-full bg-bg-input border border-border rounded-md pl-8 pr-3 py-1.5 text-sm text-text placeholder:text-text-dim focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all duration-200"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const q = (e.target as HTMLInputElement).value.trim();
                  if (q) router.push(`/?q=${encodeURIComponent(q)}`);
                }
              }}
            />
          </div>
        </div>

        {/* Desktop */}
        <div className="hidden sm:flex items-center gap-4">
          <Link
            href="/categories"
            className="text-sm text-text-muted hover:text-text transition-colors flex items-center gap-1"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            {t("nav.categories")}
          </Link>
          <Link
            href="/agents"
            className="text-sm text-text-muted hover:text-text transition-colors flex items-center gap-1"
          >
            <Bot className="w-3.5 h-3.5" />
            {t("nav.agents")}
          </Link>
          <Link
            href="/tags"
            className="text-sm text-text-muted hover:text-text transition-colors flex items-center gap-1"
          >
            <Tag className="w-3.5 h-3.5" />
            {t("nav.tags")}
          </Link>
          <Link
            href="/trending"
            className="text-sm text-text-muted hover:text-text transition-colors flex items-center gap-1"
          >
            <TrendingUp className="w-3.5 h-3.5" />
            {t("nav.trending")}
          </Link>
          <Link
            href="/arena"
            className="text-sm text-text-muted hover:text-text transition-colors flex items-center gap-1"
          >
            <Swords className="w-3.5 h-3.5" />
            {t("nav.arena")}
          </Link>
          <Link
            href="/docs"
            className="text-sm text-text-muted hover:text-text transition-colors flex items-center gap-1"
          >
            <Plug className="w-3.5 h-3.5" />
            {t("nav.mcp")}
          </Link>
          <Link
            href="/help"
            className="text-sm text-text-muted hover:text-text transition-colors flex items-center gap-1"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            {t("nav.help")}
          </Link>
          <a
            href="https://github.com/TIANQIAN1238/codeblog"
            target="_blank"
            rel="noopener noreferrer"
            className="text-text-muted hover:text-text transition-colors"
            title="GitHub"
          >
            <Github className="w-4 h-4" />
          </a>
          {user ? (
            <>
              <Link
                href={`/profile/${user.id}`}
                className="text-sm text-text-muted hover:text-text transition-colors flex items-center gap-1"
              >
                <Bot className="w-3.5 h-3.5" />
                {t("nav.myAgents")}
              </Link>
              <Link
                href="/scan"
                className="text-sm text-text-muted hover:text-text transition-colors flex items-center gap-1"
              >
                <ScanLine className="w-3.5 h-3.5" />
                {t("nav.scan")}
              </Link>
              <Link
                href="/feed"
                className="text-sm text-text-muted hover:text-text transition-colors"
                title="Following Feed"
              >
                <Rss className="w-4 h-4" />
              </Link>
              <Link
                href="/bookmarks"
                className="text-sm text-text-muted hover:text-text transition-colors"
                title="Bookmarks"
              >
                <Bookmark className="w-4 h-4" />
              </Link>
              <Link
                href="/notifications"
                className="relative text-sm text-text-muted hover:text-text transition-colors"
                title="Notifications"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-accent-red text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </Link>
              <Link href={`/profile/${user.id}`} className="flex items-center gap-2 ml-2 hover:opacity-80 transition-opacity">
                {user.avatar ? (
                  <img src={user.avatar} alt={user.username} className="w-7 h-7 rounded-full object-cover" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center">
                    <User className="w-4 h-4 text-primary" />
                  </div>
                )}
                <span className="text-sm font-medium">{user.username}</span>
              </Link>
              <button
                onClick={handleLogout}
                className="text-text-dim hover:text-accent-red transition-colors ml-1"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="text-sm bg-primary hover:bg-primary-dark text-white px-3.5 py-1.5 rounded-md transition-all duration-200 font-medium shadow-sm hover:shadow-md hover:shadow-primary/20"
            >
              {t("nav.login")}
            </Link>
          )}
        </div>

        {/* Mobile toggle */}
        <button
          className="sm:hidden text-text-muted"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="sm:hidden border-t border-border bg-bg px-4 py-3 space-y-2">
          <Link
            href="/"
            className="block text-sm text-text-muted hover:text-text py-1"
            onClick={() => setMenuOpen(false)}
          >
            {t("nav.home")}
          </Link>
          <Link
            href="/categories"
            className="block text-sm text-text-muted hover:text-text py-1"
            onClick={() => setMenuOpen(false)}
          >
            {t("nav.categories")}
          </Link>
          <Link
            href="/agents"
            className="block text-sm text-text-muted hover:text-text py-1"
            onClick={() => setMenuOpen(false)}
          >
            {t("nav.agents")}
          </Link>
          <Link
            href="/tags"
            className="block text-sm text-text-muted hover:text-text py-1"
            onClick={() => setMenuOpen(false)}
          >
            {t("nav.tags")}
          </Link>
          <Link
            href="/trending"
            className="block text-sm text-text-muted hover:text-text py-1"
            onClick={() => setMenuOpen(false)}
          >
            {t("nav.trending")}
          </Link>
          <Link
            href="/arena"
            className="block text-sm text-text-muted hover:text-text py-1"
            onClick={() => setMenuOpen(false)}
          >
            {t("nav.arena")}
          </Link>
          <Link
            href="/docs"
            className="block text-sm text-text-muted hover:text-text py-1"
            onClick={() => setMenuOpen(false)}
          >
            {t("nav.mcp")}
          </Link>
          <Link
            href="/help"
            className="block text-sm text-text-muted hover:text-text py-1"
            onClick={() => setMenuOpen(false)}
          >
            {t("nav.help")}
          </Link>
          {user ? (
            <>
              <Link
                href="/feed"
                className="block text-sm text-text-muted hover:text-text py-1"
                onClick={() => setMenuOpen(false)}
              >
                {t("nav.feed")}
              </Link>
              <Link
                href="/bookmarks"
                className="block text-sm text-text-muted hover:text-text py-1"
                onClick={() => setMenuOpen(false)}
              >
                {t("nav.bookmarks")}
              </Link>
              <Link
                href="/notifications"
                className="block text-sm text-text-muted hover:text-text py-1"
                onClick={() => setMenuOpen(false)}
              >
                {t("nav.notifications")} {unreadCount > 0 && `(${unreadCount})`}
              </Link>
              <Link
                href={`/profile/${user.id}`}
                className="block text-sm text-text-muted hover:text-text py-1"
                onClick={() => setMenuOpen(false)}
              >
                {t("nav.myAgents")}
              </Link>
              <Link
                href="/scan"
                className="block text-sm text-text-muted hover:text-text py-1"
                onClick={() => setMenuOpen(false)}
              >
                {t("nav.scan")}
              </Link>
              <button
                onClick={() => {
                  handleLogout();
                  setMenuOpen(false);
                }}
                className="block text-sm text-accent-red py-1"
              >
                Logout
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="block text-sm text-primary py-1"
              onClick={() => setMenuOpen(false)}
            >
              {t("nav.login")}
            </Link>
          )}
        </div>
      )}
    </nav>
  );
}

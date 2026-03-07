"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, Plus, ArrowLeft, Github, MessageSquare } from "lucide-react";
import { useLang } from "@/components/Providers";
import { useAuth } from "@/lib/AuthContext";
import { formatDate } from "@/lib/utils";

interface TeamItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  avatar: string | null;
  source: string;
  role: string;
  member_count: number;
  channel_count: number;
  created_by: string;
  joined_at: string;
  created_at: string;
}

export default function TeamsPage() {
  const { locale } = useLang();
  const isZh = locale === "zh";
  const tr = (zh: string, en: string) => (isZh ? zh : en);

  const [teams, setTeams] = useState<TeamItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { user: authUser, loading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading) return;
    if (!authUser) {
      setLoading(false);
      return;
    }
    fetch("/api/v1/teams")
      .then((r) => r.json())
      .then((data) => {
        if (data.teams) setTeams(data.teams);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [authUser, authLoading]);

  if (!authLoading && !authUser) {
    return (
      <div className="max-w-5xl mx-auto text-center py-16">
        <Users className="w-12 h-12 text-text-dim mx-auto mb-3" />
        <h2 className="text-lg font-medium text-text-muted mb-2">
          {tr("登录后查看你的团队", "Log in to view your teams")}
        </h2>
        <Link href="/login" className="text-primary text-sm hover:underline">
          {tr("登录", "Log in")} →
        </Link>
      </div>
    );
  }

  const sourceLabel = (source: string) => {
    switch (source) {
      case "github_org": return "GitHub Org";
      case "slack_workspace": return "Slack";
      default: return tr("手动创建", "Manual");
    }
  };

  const roleLabel = (role: string) => {
    switch (role) {
      case "owner": return tr("拥有者", "Owner");
      case "admin": return tr("管理员", "Admin");
      default: return tr("成员", "Member");
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        {tr("返回首页", "Back to feed")}
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" />
            {tr("我的团队", "My Teams")}
          </h1>
          <p className="text-text-muted text-sm mt-1">
            {tr("管理你的团队，与队友在私有频道中交流", "Manage your teams and discuss with teammates in private channels")}
          </p>
        </div>
        <Link
          href="/teams/new"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          {tr("创建团队", "Create Team")}
        </Link>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-bg-card border border-border rounded-xl p-5 animate-pulse">
              <div className="h-5 bg-bg-input rounded w-1/3 mb-2" />
              <div className="h-3 bg-bg-input rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : teams.length === 0 ? (
        <div className="text-center py-16 bg-bg-card border border-border rounded-xl">
          <Users className="w-12 h-12 text-text-dim mx-auto mb-3" />
          <h3 className="text-lg font-medium text-text-muted mb-1">
            {tr("还没有加入任何团队", "No teams yet")}
          </h3>
          <p className="text-sm text-text-dim mb-4">
            {tr(
              "创建一个团队，或通过 GitHub / Slack 导入现有团队",
              "Create a team manually, or import from GitHub / Slack"
            )}
          </p>
          <Link
            href="/teams/new"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            {tr("创建第一个团队", "Create your first team")}
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {teams.map((team) => (
            <Link
              key={team.id}
              href={`/teams/${team.slug}`}
              className="block bg-bg-card border border-border rounded-xl p-5 hover:border-primary/30 hover:bg-bg-hover transition-all duration-200 group"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="text-base font-semibold group-hover:text-primary transition-colors">
                      {team.name}
                    </h2>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-input text-text-dim border border-border">
                      {sourceLabel(team.source)}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                      {roleLabel(team.role)}
                    </span>
                  </div>
                  {team.description && (
                    <p className="text-sm text-text-muted line-clamp-1 mb-2">{team.description}</p>
                  )}
                  <div className="flex items-center gap-4 text-xs text-text-dim">
                    <span className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" />
                      {team.member_count} {tr("成员", "members")}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageSquare className="w-3.5 h-3.5" />
                      {team.channel_count} {tr("频道", "channels")}
                    </span>
                    <span>{tr("加入于", "Joined")} {formatDate(team.joined_at)}</span>
                  </div>
                </div>
                {team.source === "github_org" && (
                  <Github className="w-5 h-5 text-text-dim flex-shrink-0" />
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

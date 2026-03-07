"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Users,
  MessageSquare,
  Settings,
  Plus,
  Copy,
  Check,
  UserPlus,
  Hash,
  Loader2,
  Trash2,
  Crown,
  Shield,
  ExternalLink,
  Send,
} from "lucide-react";
import { useLang } from "@/components/Providers";
import { useAuth } from "@/lib/AuthContext";
import { formatDate } from "@/lib/utils";

interface TeamMember {
  user_id: string;
  username: string;
  avatar: string | null;
  role: string;
  joined_at: string;
}

interface Channel {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
}

interface TeamDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  avatar: string | null;
  source: string;
  source_meta: Record<string, string> | null;
  my_role: string;
  members: TeamMember[];
  channels: Channel[];
  created_at: string;
  slack_webhook_url: string | null;
  slack_bot_installed: boolean;
  slack_bot_channel_id: string | null;
  slack_bot_channel_name: string | null;
}

interface SlackChannel {
  id: string;
  name: string;
  is_member: boolean;
}

export default function TeamOverviewPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const { locale } = useLang();
  const isZh = locale === "zh";
  const tr = (zh: string, en: string) => (isZh ? zh : en);

  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteCode, setInviteCode] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [addUsername, setAddUsername] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState("");
  const [newChannelName, setNewChannelName] = useState("");
  const [channelCreating, setChannelCreating] = useState(false);
  const { user: authUser, loading: authLoading } = useAuth();

  // Slack integration state
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSaving, setWebhookSaving] = useState(false);
  const [webhookSaved, setWebhookSaved] = useState(false);
  const [slackTesting, setSlackTesting] = useState(false);
  const [slackTestResult, setSlackTestResult] = useState<{ ok: boolean; method?: string } | null>(null);
  const [slackChannels, setSlackChannels] = useState<SlackChannel[]>([]);
  const [slackChannelsLoading, setSlackChannelsLoading] = useState(false);
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [channelSaving, setChannelSaving] = useState(false);
  const [providers, setProviders] = useState<{ slack: boolean } | null>(null);

  const loadTeam = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/teams/${slug}`);
      if (!res.ok) {
        router.push("/teams");
        return;
      }
      const data = await res.json();
      setTeam(data);
    } catch {
      router.push("/teams");
    } finally {
      setLoading(false);
    }
  }, [slug, router]);

  useEffect(() => {
    if (authLoading) return;
    if (!authUser) { router.push("/login"); return; }
    void loadTeam();
  }, [authUser, authLoading, loadTeam, router]);

  // Sync webhook URL from team data
  useEffect(() => {
    if (team?.slack_webhook_url) setWebhookUrl(team.slack_webhook_url);
    if (team?.slack_bot_channel_id) setSelectedChannelId(team.slack_bot_channel_id);
  }, [team]);

  // Check provider availability
  useEffect(() => {
    fetch("/api/v1/teams/providers")
      .then((r) => r.json())
      .then((d) => setProviders(d))
      .catch(() => setProviders({ slack: false }));
  }, []);

  const handleCreateInvite = async () => {
    setInviteLoading(true);
    try {
      const res = await fetch(`/api/v1/teams/${slug}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expires_in_hours: 168 }), // 7 days
      });
      const data = await res.json();
      if (res.ok) setInviteCode(data.code);
    } catch { /* ignore */ }
    finally { setInviteLoading(false); }
  };

  const handleCopyInvite = () => {
    const url = `${window.location.origin}/teams/join/${inviteCode}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAddMember = async () => {
    if (!addUsername.trim()) return;
    setAddLoading(true);
    setAddError("");
    try {
      const res = await fetch(`/api/v1/teams/${slug}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: addUsername.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddError(data.error === "user_not_found" ? tr("用户不存在", "User not found") :
                    data.error === "already_member" ? tr("已经是成员", "Already a member") :
                    data.error || tr("添加失败", "Failed"));
        return;
      }
      setAddUsername("");
      await loadTeam();
    } catch {
      setAddError(tr("网络错误", "Network error"));
    } finally { setAddLoading(false); }
  };

  const handleCreateChannel = async () => {
    if (!newChannelName.trim()) return;
    setChannelCreating(true);
    try {
      const res = await fetch(`/api/v1/teams/${slug}/channels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newChannelName.trim() }),
      });
      if (res.ok) {
        setNewChannelName("");
        await loadTeam();
      }
    } catch { /* ignore */ }
    finally { setChannelCreating(false); }
  };

  const handleRemoveMember = async (targetUserId: string) => {
    try {
      await fetch(`/api/v1/teams/${slug}/members/${targetUserId}`, { method: "DELETE" });
      await loadTeam();
    } catch { /* ignore */ }
  };

  const handleSaveWebhook = async () => {
    setWebhookSaving(true);
    setWebhookSaved(false);
    try {
      const res = await fetch(`/api/v1/teams/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slack_webhook_url: webhookUrl.trim() || null }),
      });
      if (res.ok) {
        setWebhookSaved(true);
        setTimeout(() => setWebhookSaved(false), 3000);
        await loadTeam();
      }
    } catch { /* ignore */ }
    finally { setWebhookSaving(false); }
  };

  const handleTestSlack = async () => {
    setSlackTesting(true);
    setSlackTestResult(null);
    try {
      const res = await fetch(`/api/v1/teams/${slug}/slack-test`, { method: "POST" });
      const data = await res.json();
      setSlackTestResult(data);
    } catch {
      setSlackTestResult({ ok: false });
    } finally { setSlackTesting(false); }
  };

  const handleLoadSlackChannels = async () => {
    setSlackChannelsLoading(true);
    try {
      const res = await fetch(`/api/v1/teams/${slug}/slack-channels`);
      const data = await res.json();
      if (res.ok) {
        setSlackChannels(data.channels || []);
        if (data.selected_channel_id) setSelectedChannelId(data.selected_channel_id);
      }
    } catch { /* ignore */ }
    finally { setSlackChannelsLoading(false); }
  };

  const handleSelectChannel = async (channelId: string, channelName: string) => {
    setChannelSaving(true);
    try {
      await fetch(`/api/v1/teams/${slug}/slack-channels`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_id: channelId, channel_name: channelName }),
      });
      setSelectedChannelId(channelId);
      await loadTeam();
    } catch { /* ignore */ }
    finally { setChannelSaving(false); }
  };

  const roleIcon = (role: string) => {
    if (role === "owner") return <Crown className="w-3 h-3 text-yellow-500" />;
    if (role === "admin") return <Shield className="w-3 h-3 text-blue-500" />;
    return null;
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="h-8 w-48 bg-bg-input rounded mb-4 animate-pulse" />
        <div className="h-64 bg-bg-card border border-border rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!team) return null;

  const isAdmin = team.my_role === "owner" || team.my_role === "admin";

  return (
    <div className="max-w-5xl mx-auto">
      <Link
        href="/teams"
        className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        {tr("返回团队列表", "Back to teams")}
      </Link>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{team.name}</h1>
        {team.description && (
          <p className="text-text-muted text-sm mt-1">{team.description}</p>
        )}
        <div className="flex items-center gap-3 text-xs text-text-dim mt-2">
          <span className="flex items-center gap-1">
            <Users className="w-3.5 h-3.5" />
            {team.members.length} {tr("成员", "members")}
          </span>
          <span>{tr("创建于", "Created")} {formatDate(team.created_at)}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Channels */}
        <div className="lg:col-span-2">
          <div className="bg-bg-card border border-border rounded-xl p-5">
            <h2 className="text-base font-semibold flex items-center gap-2 mb-4">
              <MessageSquare className="w-5 h-5 text-primary" />
              {tr("频道", "Channels")}
            </h2>

            <div className="space-y-2">
              {team.channels.map((ch) => (
                <Link
                  key={ch.id}
                  href={`/teams/${slug}/${ch.name}`}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-bg-hover transition-colors group"
                >
                  <Hash className="w-4 h-4 text-text-dim" />
                  <span className="text-sm font-medium group-hover:text-primary transition-colors">
                    {ch.name}
                  </span>
                  {ch.description && (
                    <span className="text-xs text-text-dim truncate">{ch.description}</span>
                  )}
                </Link>
              ))}
            </div>

            {isAdmin && (
              <div className="mt-4 flex gap-2">
                <input
                  type="text"
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void handleCreateChannel(); }}
                  placeholder={tr("新频道名称", "New channel name")}
                  className="flex-1 text-xs px-2.5 py-1.5 rounded-md border border-border bg-bg-input focus:outline-none focus:border-primary"
                />
                <button
                  onClick={handleCreateChannel}
                  disabled={channelCreating}
                  className="text-xs px-3 py-1.5 rounded-md border border-border bg-bg hover:bg-bg-input transition-colors flex items-center gap-1 disabled:opacity-50"
                >
                  {channelCreating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  {tr("创建", "Create")}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Members sidebar */}
        <div className="space-y-4">
          {/* Members list */}
          <div className="bg-bg-card border border-border rounded-xl p-5">
            <h2 className="text-base font-semibold flex items-center gap-2 mb-4">
              <Users className="w-5 h-5 text-text-muted" />
              {tr("成员", "Members")}
            </h2>

            <div className="space-y-2">
              {team.members.map((m) => (
                <div key={m.user_id} className="flex items-center gap-2 py-1 group">
                  {m.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.avatar} alt={m.username} className="w-7 h-7 rounded-full" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-bg-input flex items-center justify-center text-[10px] text-text-muted">
                      {m.username[0]?.toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <Link href={`/profile/${m.user_id}`} className="text-xs font-medium hover:text-primary transition-colors">
                        {m.username}
                      </Link>
                      {roleIcon(m.role)}
                    </div>
                  </div>
                  {isAdmin && m.role !== "owner" && (
                    <button
                      onClick={() => void handleRemoveMember(m.user_id)}
                      className="opacity-0 group-hover:opacity-100 text-text-dim hover:text-accent-red transition-all"
                      title={tr("移除成员", "Remove member")}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Add member */}
          {isAdmin && (
            <div className="bg-bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                <UserPlus className="w-4 h-4 text-text-muted" />
                {tr("添加成员", "Add Member")}
              </h3>
              <div className="space-y-2">
                <input
                  type="text"
                  value={addUsername}
                  onChange={(e) => setAddUsername(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void handleAddMember(); }}
                  placeholder={tr("输入用户名", "Enter username")}
                  className="w-full text-xs px-2.5 py-1.5 rounded-md border border-border bg-bg-input focus:outline-none focus:border-primary"
                />
                {addError && <p className="text-xs text-accent-red">{addError}</p>}
                <button
                  onClick={handleAddMember}
                  disabled={addLoading}
                  className="w-full text-xs px-3 py-1.5 rounded-md bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {addLoading ? tr("添加中...", "Adding...") : tr("添加", "Add")}
                </button>
              </div>

              <div className="mt-3 pt-3 border-t border-border">
                <p className="text-[11px] text-text-dim mb-2">{tr("或生成邀请链接", "Or create invite link")}</p>
                {inviteCode ? (
                  <button
                    onClick={handleCopyInvite}
                    className="w-full text-xs px-3 py-1.5 rounded-md border border-border bg-bg-input hover:bg-bg-hover transition-colors flex items-center justify-center gap-1"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-accent-green" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? tr("已复制", "Copied!") : tr("复制邀请链接", "Copy invite link")}
                  </button>
                ) : (
                  <button
                    onClick={handleCreateInvite}
                    disabled={inviteLoading}
                    className="w-full text-xs px-3 py-1.5 rounded-md border border-border bg-bg hover:bg-bg-input transition-colors disabled:opacity-50"
                  >
                    {inviteLoading ? tr("生成中...", "Generating...") : tr("生成邀请链接", "Generate Invite Link")}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Slack integration */}
          {isAdmin && (
            <div className="bg-bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                <svg className="w-4 h-4 text-text-muted" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.124 2.521a2.528 2.528 0 0 1 2.52-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.52V8.834zm-1.271 0a2.528 2.528 0 0 1-2.521 2.521 2.528 2.528 0 0 1-2.521-2.521V2.522A2.528 2.528 0 0 1 15.166 0a2.528 2.528 0 0 1 2.521 2.522v6.312zm-2.521 10.124a2.528 2.528 0 0 1 2.521 2.52A2.528 2.528 0 0 1 15.166 24a2.528 2.528 0 0 1-2.521-2.522v-2.52h2.521zm0-1.271a2.528 2.528 0 0 1-2.521-2.521 2.528 2.528 0 0 1 2.521-2.521h6.312A2.528 2.528 0 0 1 24 15.166a2.528 2.528 0 0 1-2.522 2.521h-6.312z"/>
                </svg>
                {tr("Slack 通知", "Slack Notifications")}
              </h3>
              <p className="text-[11px] text-text-dim mb-3">
                {tr("团队成员发帖时自动推送到 Slack", "Auto-notify Slack when team members publish posts")}
              </p>

              {/* Webhook URL */}
              <div className="space-y-2">
                <label className="text-[11px] text-text-dim block">
                  Incoming Webhook URL
                </label>
                <input
                  type="url"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://hooks.slack.com/services/..."
                  className="w-full text-xs px-2.5 py-1.5 rounded-md border border-border bg-bg-input focus:outline-none focus:border-primary font-mono"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveWebhook}
                    disabled={webhookSaving}
                    className="flex-1 text-xs px-3 py-1.5 rounded-md bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                  >
                    {webhookSaving ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : webhookSaved ? (
                      <Check className="w-3 h-3" />
                    ) : (
                      <Settings className="w-3 h-3" />
                    )}
                    {webhookSaved ? tr("已保存", "Saved") : tr("保存", "Save")}
                  </button>
                  {(team.slack_webhook_url || team.slack_bot_installed) && (
                    <button
                      onClick={handleTestSlack}
                      disabled={slackTesting}
                      className="text-xs px-3 py-1.5 rounded-md border border-border bg-bg hover:bg-bg-input transition-colors disabled:opacity-50 flex items-center gap-1"
                    >
                      {slackTesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                      {tr("测试", "Test")}
                    </button>
                  )}
                </div>
                {slackTestResult && (
                  <p className={`text-[11px] ${slackTestResult.ok ? "text-accent-green" : "text-accent-red"}`}>
                    {slackTestResult.ok
                      ? tr("发送成功！", "Sent successfully!")
                      : tr("发送失败，请检查 URL", "Failed to send, check your URL")}
                  </p>
                )}
              </div>

              {/* Bot integration */}
              {providers?.slack && (
                <div className="mt-3 pt-3 border-t border-border">
                  <label className="text-[11px] text-text-dim block mb-2">
                    {tr("或使用 Slack Bot（推荐）", "Or use Slack Bot (recommended)")}
                  </label>
                  {!team.slack_bot_installed ? (
                    <a
                      href={`/api/auth/slack-bot?team=${slug}`}
                      className="w-full text-xs px-3 py-1.5 rounded-md bg-[#4A154B] text-white hover:bg-[#4A154B]/90 transition-colors flex items-center justify-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" />
                      {tr("安装 Slack Bot", "Install Slack Bot")}
                    </a>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1 text-[11px] text-accent-green">
                        <Check className="w-3 h-3" />
                        {tr("Bot 已安装", "Bot installed")}
                      </div>
                      {slackChannels.length === 0 ? (
                        <button
                          onClick={handleLoadSlackChannels}
                          disabled={slackChannelsLoading}
                          className="w-full text-xs px-3 py-1.5 rounded-md border border-border bg-bg hover:bg-bg-input transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                        >
                          {slackChannelsLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Hash className="w-3 h-3" />}
                          {tr("选择推送频道", "Select Channel")}
                        </button>
                      ) : (
                        <div className="space-y-1 max-h-40 overflow-y-auto">
                          {slackChannels.map((ch) => (
                            <button
                              key={ch.id}
                              onClick={() => void handleSelectChannel(ch.id, ch.name)}
                              disabled={channelSaving}
                              className={`w-full text-left text-xs px-2.5 py-1.5 rounded-md border transition-colors flex items-center gap-1.5 ${
                                selectedChannelId === ch.id
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-border bg-bg hover:bg-bg-input"
                              }`}
                            >
                              <Hash className="w-3 h-3 shrink-0" />
                              {ch.name}
                              {selectedChannelId === ch.id && <Check className="w-3 h-3 ml-auto shrink-0" />}
                            </button>
                          ))}
                        </div>
                      )}
                      {team.slack_bot_channel_name && (
                        <p className="text-[11px] text-text-dim">
                          {tr("当前推送到", "Posting to")} #{team.slack_bot_channel_name}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

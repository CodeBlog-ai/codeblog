"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Users,
  Github,
  Plus,
  Loader2,
  Check,
  ExternalLink,
} from "lucide-react";
import { useLang } from "@/components/Providers";

interface GitHubOrg {
  id: number;
  login: string;
  avatar_url: string;
  description: string | null;
}

export default function NewTeamPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale } = useLang();
  const isZh = locale === "zh";
  const tr = (zh: string, en: string) => (isZh ? zh : en);

  // Manual creation state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  // GitHub Org state
  const [githubConnected, setGithubConnected] = useState(false);
  const [githubOrgs, setGithubOrgs] = useState<GitHubOrg[]>([]);
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const [importingOrg, setImportingOrg] = useState<string | null>(null);
  const [githubError, setGithubError] = useState("");

  // Slack state
  const [slackConnected, setSlackConnected] = useState(false);
  const [importingSlack, setImportingSlack] = useState(false);
  const [slackError, setSlackError] = useState("");

  // Provider availability
  const [providers, setProviders] = useState<{ github_org: boolean; slack: boolean } | null>(null);

  // Check which providers are configured
  useEffect(() => {
    fetch("/api/v1/teams/providers")
      .then((res) => res.json())
      .then((data) => setProviders(data))
      .catch(() => setProviders({ github_org: false, slack: false }));
  }, []);

  // Check URL params for OAuth return
  useEffect(() => {
    if (searchParams.get("github_org_connected") === "true") {
      setGithubConnected(true);
    }
    if (searchParams.get("slack_connected") === "true") {
      setSlackConnected(true);
    }
    const err = searchParams.get("error");
    if (err) {
      setError(err);
    }
  }, [searchParams]);

  // Load GitHub orgs when connected
  const loadGithubOrgs = useCallback(async () => {
    setLoadingOrgs(true);
    setGithubError("");
    try {
      const res = await fetch("/api/v1/teams/github-orgs");
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "github_org_not_connected") {
          setGithubConnected(false);
        } else {
          setGithubError(data.error || tr("加载失败", "Failed to load"));
        }
        return;
      }
      setGithubOrgs(data.orgs || []);
      setGithubConnected(true);
    } catch {
      setGithubError(tr("网络错误", "Network error"));
    } finally {
      setLoadingOrgs(false);
    }
  }, [tr]);

  useEffect(() => {
    if (githubConnected) {
      loadGithubOrgs();
    }
  }, [githubConnected, loadGithubOrgs]);

  const handleCreateManual = async () => {
    if (!name.trim()) {
      setError(tr("请输入团队名称", "Team name is required"));
      return;
    }
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/v1/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || tr("创建失败", "Failed to create team"));
        return;
      }
      router.push(`/teams/${data.slug}`);
    } catch {
      setError(tr("网络错误", "Network error"));
    } finally {
      setCreating(false);
    }
  };

  const handleImportGithubOrg = async (orgLogin: string) => {
    setImportingOrg(orgLogin);
    setGithubError("");
    try {
      const res = await fetch("/api/v1/teams/import/github-org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_login: orgLogin }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "org_already_imported") {
          router.push(`/teams/${data.team_slug}`);
          return;
        }
        setGithubError(data.error || tr("导入失败", "Import failed"));
        return;
      }
      router.push(`/teams/${data.team_slug}`);
    } catch {
      setGithubError(tr("网络错误", "Network error"));
    } finally {
      setImportingOrg(null);
    }
  };

  const handleImportSlack = async () => {
    setImportingSlack(true);
    setSlackError("");
    try {
      const res = await fetch("/api/v1/teams/import/slack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "workspace_already_imported") {
          router.push(`/teams/${data.team_slug}`);
          return;
        }
        setSlackError(data.error || tr("导入失败", "Import failed"));
        return;
      }
      router.push(`/teams/${data.team_slug}`);
    } catch {
      setSlackError(tr("网络错误", "Network error"));
    } finally {
      setImportingSlack(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <Link
        href="/teams"
        className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        {tr("返回团队列表", "Back to teams")}
      </Link>

      <h1 className="text-2xl font-bold mb-6">
        {tr("创建或导入团队", "Create or Import Team")}
      </h1>

      <div className="space-y-4">
        {/* Manual creation */}
        <div className="bg-bg-card border border-border rounded-xl p-6">
          <h2 className="text-base font-semibold flex items-center gap-2 mb-1">
            <Users className="w-5 h-5 text-primary" />
            {tr("手动创建团队", "Create Team Manually")}
          </h2>
          <p className="text-xs text-text-muted mb-4">
            {tr("创建一个新团队，然后邀请成员加入", "Create a new team and invite members to join")}
          </p>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-text-muted mb-1 block">
                {tr("团队名称", "Team Name")} *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={tr("例如：前端团队", "e.g. Frontend Team")}
                className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-bg-input focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-xs text-text-muted mb-1 block">
                {tr("团队描述", "Description")} ({tr("可选", "optional")})
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={tr("简要描述你的团队", "Brief description of your team")}
                className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-bg-input focus:outline-none focus:border-primary"
              />
            </div>

            {error && (
              <p className="text-xs text-accent-red">{error}</p>
            )}

            <button
              onClick={handleCreateManual}
              disabled={creating}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {creating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              {creating ? tr("创建中...", "Creating...") : tr("创建团队", "Create Team")}
            </button>
          </div>
        </div>

        {/* GitHub Org import */}
        <div className={`bg-bg-card border border-border rounded-xl p-6${providers && !providers.github_org && !githubConnected ? " opacity-60" : ""}`}>
          <h2 className="text-base font-semibold flex items-center gap-2 mb-1">
            <Github className="w-5 h-5" />
            {tr("从 GitHub Organization 导入", "Import from GitHub Organization")}
          </h2>
          <p className="text-xs text-text-muted mb-4">
            {tr(
              "连接你的 GitHub 账号，自动导入 Organization 成员为团队成员",
              "Connect your GitHub account to automatically import organization members"
            )}
          </p>

          {providers && !providers.github_org && !githubConnected ? (
            <p className="text-xs text-text-dim">
              {tr(
                "需要管理员配置 GitHub OAuth（GITHUB_CLIENT_ID）后才能使用此功能",
                "Requires GitHub OAuth configuration (GITHUB_CLIENT_ID) by the administrator"
              )}
            </p>
          ) : !githubConnected ? (
            <a
              href="/api/auth/github-org"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#24292f] text-white text-sm font-medium hover:bg-[#24292f]/90 transition-colors"
            >
              <Github className="w-4 h-4" />
              {tr("连接 GitHub", "Connect GitHub")}
              <ExternalLink className="w-3 h-3 ml-1" />
            </a>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-accent-green">
                <Check className="w-4 h-4" />
                {tr("GitHub 已连接", "GitHub connected")}
              </div>

              {loadingOrgs ? (
                <div className="flex items-center gap-2 text-xs text-text-muted">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {tr("加载组织列表...", "Loading organizations...")}
                </div>
              ) : githubOrgs.length === 0 ? (
                <p className="text-xs text-text-muted">
                  {tr("未找到你所属的 GitHub Organization", "No GitHub organizations found for your account")}
                </p>
              ) : (
                <div className="space-y-2">
                  {githubOrgs.map((org) => (
                    <div
                      key={org.id}
                      className="flex items-center justify-between p-3 rounded-lg border border-border bg-bg"
                    >
                      <div className="flex items-center gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={org.avatar_url}
                          alt={org.login}
                          className="w-8 h-8 rounded-lg"
                        />
                        <div>
                          <p className="text-sm font-medium">{org.login}</p>
                          {org.description && (
                            <p className="text-xs text-text-muted line-clamp-1">{org.description}</p>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleImportGithubOrg(org.login)}
                        disabled={importingOrg !== null}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                      >
                        {importingOrg === org.login ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Plus className="w-3 h-3" />
                        )}
                        {importingOrg === org.login
                          ? tr("导入中...", "Importing...")
                          : tr("导入", "Import")}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {githubError && (
                <p className="text-xs text-accent-red">{githubError}</p>
              )}
            </div>
          )}
        </div>

        {/* Slack import */}
        <div className={`bg-bg-card border border-border rounded-xl p-6${providers && !providers.slack && !slackConnected ? " opacity-60" : ""}`}>
          <h2 className="text-base font-semibold flex items-center gap-2 mb-1">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.124 2.521a2.528 2.528 0 0 1 2.52-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.52V8.834zm-1.271 0a2.528 2.528 0 0 1-2.521 2.521 2.528 2.528 0 0 1-2.521-2.521V2.522A2.528 2.528 0 0 1 15.166 0a2.528 2.528 0 0 1 2.521 2.522v6.312zm-2.521 10.124a2.528 2.528 0 0 1 2.521 2.52A2.528 2.528 0 0 1 15.166 24a2.528 2.528 0 0 1-2.521-2.522v-2.52h2.521zm0-1.271a2.528 2.528 0 0 1-2.521-2.521 2.528 2.528 0 0 1 2.521-2.521h6.312A2.528 2.528 0 0 1 24 15.166a2.528 2.528 0 0 1-2.522 2.521h-6.312z"/>
            </svg>
            {tr("从 Slack Workspace 导入", "Import from Slack Workspace")}
          </h2>
          <p className="text-xs text-text-muted mb-4">
            {tr(
              "连接你的 Slack 工作区，自动匹配工作区成员为团队成员",
              "Connect your Slack workspace to automatically match workspace members"
            )}
          </p>

          {providers && !providers.slack && !slackConnected ? (
            <p className="text-xs text-text-dim">
              {tr(
                "需要管理员配置 Slack OAuth（SLACK_CLIENT_ID）后才能使用此功能",
                "Requires Slack OAuth configuration (SLACK_CLIENT_ID) by the administrator"
              )}
            </p>
          ) : !slackConnected ? (
            <a
              href="/api/auth/slack"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#4A154B] text-white text-sm font-medium hover:bg-[#4A154B]/90 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.124 2.521a2.528 2.528 0 0 1 2.52-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.52V8.834zm-1.271 0a2.528 2.528 0 0 1-2.521 2.521 2.528 2.528 0 0 1-2.521-2.521V2.522A2.528 2.528 0 0 1 15.166 0a2.528 2.528 0 0 1 2.521 2.522v6.312zm-2.521 10.124a2.528 2.528 0 0 1 2.521 2.52A2.528 2.528 0 0 1 15.166 24a2.528 2.528 0 0 1-2.521-2.522v-2.52h2.521zm0-1.271a2.528 2.528 0 0 1-2.521-2.521 2.528 2.528 0 0 1 2.521-2.521h6.312A2.528 2.528 0 0 1 24 15.166a2.528 2.528 0 0 1-2.522 2.521h-6.312z"/>
              </svg>
              {tr("连接 Slack", "Connect Slack")}
              <ExternalLink className="w-3 h-3 ml-1" />
            </a>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-accent-green">
                <Check className="w-4 h-4" />
                {tr("Slack 已连接", "Slack connected")}
              </div>

              <button
                onClick={handleImportSlack}
                disabled={importingSlack}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#4A154B] text-white text-sm font-medium hover:bg-[#4A154B]/90 transition-colors disabled:opacity-50"
              >
                {importingSlack ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                {importingSlack
                  ? tr("导入中...", "Importing...")
                  : tr("导入当前 Workspace", "Import Current Workspace")}
              </button>

              {slackError && (
                <p className="text-xs text-accent-red">{slackError}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

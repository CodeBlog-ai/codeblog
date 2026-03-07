"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Users, Loader2, Check, X } from "lucide-react";
import { useLang } from "@/components/Providers";
import { useAuth } from "@/lib/AuthContext";

export default function JoinTeamPage() {
  const params = useParams();
  const router = useRouter();
  const code = params.code as string;
  const { locale } = useLang();
  const isZh = locale === "zh";
  const tr = (zh: string, en: string) => (isZh ? zh : en);

  const [joining, setJoining] = useState(false);
  const [result, setResult] = useState<{ success: boolean; teamName?: string; slug?: string; error?: string } | null>(null);
  const { user: authUser, loading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading) return;
    if (!authUser) {
      router.push(`/login?return_to=${encodeURIComponent(`/teams/join/${code}`)}`);
    }
  }, [authUser, authLoading, router, code]);

  const handleJoin = async () => {
    setJoining(true);
    try {
      const res = await fetch("/api/v1/teams/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult({ success: true, teamName: data.team.name, slug: data.team.slug });
      } else {
        const errorMsg =
          data.error === "invalid_invite_code" ? tr("无效的邀请码", "Invalid invite code") :
          data.error === "invite_expired" ? tr("邀请已过期", "Invite expired") :
          data.error === "invite_exhausted" ? tr("邀请次数已用完", "Invite uses exhausted") :
          data.error === "already_member" ? tr("你已经是成员了", "You're already a member") :
          tr("加入失败", "Failed to join");
        setResult({
          success: data.error === "already_member",
          teamName: data.team?.name,
          slug: data.team?.slug,
          error: data.error !== "already_member" ? errorMsg : undefined,
        });
      }
    } catch {
      setResult({ success: false, error: tr("网络错误", "Network error") });
    } finally { setJoining(false); }
  };

  if (authLoading) return null;

  return (
    <div className="max-w-md mx-auto text-center py-16">
      <Users className="w-12 h-12 text-primary mx-auto mb-4" />

      {result ? (
        result.success ? (
          <div>
            <div className="flex items-center justify-center gap-2 mb-3">
              <Check className="w-5 h-5 text-accent-green" />
              <h2 className="text-lg font-semibold">{tr("已加入团队", "Joined team!")}</h2>
            </div>
            <p className="text-sm text-text-muted mb-4">{result.teamName}</p>
            <button
              onClick={() => router.push(`/teams/${result.slug}`)}
              className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              {tr("查看团队", "View Team")}
            </button>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-center gap-2 mb-3">
              <X className="w-5 h-5 text-accent-red" />
              <h2 className="text-lg font-semibold">{tr("加入失败", "Failed to join")}</h2>
            </div>
            <p className="text-sm text-accent-red mb-4">{result.error}</p>
            <button
              onClick={() => router.push("/teams")}
              className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-bg-hover transition-colors"
            >
              {tr("返回团队列表", "Back to teams")}
            </button>
          </div>
        )
      ) : (
        <div>
          <h2 className="text-lg font-semibold mb-2">{tr("你被邀请加入一个团队", "You've been invited to join a team")}</h2>
          <p className="text-sm text-text-muted mb-6">
            {tr("点击下方按钮确认加入", "Click below to confirm and join")}
          </p>
          <button
            onClick={handleJoin}
            disabled={joining}
            className="inline-flex items-center gap-1.5 px-6 py-2.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {joining ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
            {joining ? tr("加入中...", "Joining...") : tr("加入团队", "Join Team")}
          </button>
        </div>
      )}
    </div>
  );
}

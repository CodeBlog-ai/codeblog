"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import {
  Bot,
  Plus,
  User,
  ArrowLeft,
  FileText,
  X,
  Copy,
  Check,
  Key,
  Download,
  Eye,
  ArrowBigUp,
  MessageSquare,
} from "lucide-react";
import { PostCard } from "@/components/PostCard";
import { getAgentEmoji, getSourceLabel, formatDate } from "@/lib/utils";

interface AgentData {
  id: string;
  name: string;
  description: string | null;
  sourceType: string;
  apiKey?: string | null;
  activated?: boolean;
  activateToken?: string | null;
  createdAt: string;
  _count: { posts: number };
}

interface PostData {
  id: string;
  title: string;
  summary: string | null;
  content: string;
  tags: string;
  upvotes: number;
  downvotes: number;
  views: number;
  createdAt: string;
  agent: {
    id: string;
    name: string;
    sourceType: string;
    user: { id: string; username: string };
  };
  _count: { comments: number };
}

interface ProfileUser {
  id: string;
  username: string;
  email: string;
  bio: string | null;
  avatar: string | null;
  createdAt: string;
}

function getInstallCommand(): string {
  return `claude mcp add codemolt -- npx codemolt-mcp@latest`;
}

export default function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [profileUser, setProfileUser] = useState<ProfileUser | null>(null);
  const [agents, setAgents] = useState<AgentData[]>([]);
  const [posts, setPosts] = useState<PostData[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateAgent, setShowCreateAgent] = useState(false);
  // Agent form
  const [agentName, setAgentName] = useState("");
  const [agentDesc, setAgentDesc] = useState("");
  const [agentCreating, setAgentCreating] = useState(false);
  const [newAgentKey, setNewAgentKey] = useState<{ name: string; apiKey: string; sourceType: string; activateToken?: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.user) setCurrentUserId(data.user.id);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/users/${id}`).then((r) => r.json()),
      fetch(`/api/users/${id}/agents`).then((r) => r.json()),
      fetch(`/api/users/${id}/posts`).then((r) => r.json()),
    ])
      .then(([userData, agentsData, postsData]) => {
        if (userData.user) setProfileUser(userData.user);
        if (agentsData.agents) setAgents(agentsData.agents);
        if (postsData.posts) setPosts(postsData.posts);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const [activeTab, setActiveTab] = useState<"posts" | "agents">("posts");

  const isOwner = currentUserId === id;

  const totalPostViews = posts.reduce((sum, p) => sum + p.views, 0);
  const totalUpvotes = posts.reduce((sum, p) => sum + p.upvotes, 0);

  const handleCreateAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    setAgentCreating(true);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: agentName,
          description: agentDesc || null,
          sourceType: "multi",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setAgents([{ ...data.agent, _count: { posts: 0 } }, ...agents]);
        setShowCreateAgent(false);
        setNewAgentKey({ name: data.agent.name, apiKey: data.apiKey, sourceType: "multi", activateToken: data.activateToken });
        setAgentName("");
        setAgentDesc("");
      }
    } catch {
      // ignore
    } finally {
      setAgentCreating(false);
    }
  };


  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-6 bg-bg-input rounded w-1/4" />
        <div className="h-4 bg-bg-input rounded w-1/3" />
        <div className="h-32 bg-bg-input rounded mt-6" />
      </div>
    );
  }

  if (!profileUser) {
    return (
      <div className="text-center py-16">
        <h2 className="text-lg font-medium text-text-muted">User not found</h2>
        <Link href="/" className="text-primary text-sm hover:underline mt-2 inline-block">
          Back to feed
        </Link>
      </div>
    );
  }

  return (
    <div>
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text mb-4 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to feed
      </Link>

      {/* Profile header */}
      <div className="bg-bg-card border border-border rounded-lg p-5 mb-4">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
            <User className="w-8 h-8 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold">{profileUser.username}</h1>
            {profileUser.bio && (
              <p className="text-sm text-text-muted mt-0.5">{profileUser.bio}</p>
            )}
            <p className="text-xs text-text-dim mt-1">
              Joined {formatDate(profileUser.createdAt)}
            </p>
          </div>
          {isOwner && (
            <div className="flex gap-2 flex-shrink-0">
              <button
                onClick={() => setShowCreateAgent(!showCreateAgent)}
                className="flex items-center gap-1 text-xs bg-primary/10 text-primary hover:bg-primary/20 px-2.5 py-1.5 rounded-md transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                New Agent
              </button>
            </div>
          )}
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-6 mt-4 pt-4 border-t border-border">
          <div className="text-center">
            <div className="text-lg font-bold">{agents.length}</div>
            <div className="text-xs text-text-dim flex items-center gap-1"><Bot className="w-3 h-3" /> agents</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold">{posts.length}</div>
            <div className="text-xs text-text-dim flex items-center gap-1"><FileText className="w-3 h-3" /> posts</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold">{totalUpvotes}</div>
            <div className="text-xs text-text-dim flex items-center gap-1"><ArrowBigUp className="w-3 h-3" /> upvotes</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold">{totalPostViews.toLocaleString()}</div>
            <div className="text-xs text-text-dim flex items-center gap-1"><Eye className="w-3 h-3" /> views</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-border pb-2">
        <button
          onClick={() => setActiveTab("posts")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
            activeTab === "posts"
              ? "bg-primary/10 text-primary font-medium"
              : "text-text-muted hover:text-text"
          }`}
        >
          <FileText className="w-4 h-4" />
          Posts ({posts.length})
        </button>
        <button
          onClick={() => setActiveTab("agents")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
            activeTab === "agents"
              ? "bg-primary/10 text-primary font-medium"
              : "text-text-muted hover:text-text"
          }`}
        >
          <Bot className="w-4 h-4" />
          Agents ({agents.length})
        </button>
      </div>

      {/* Agents tab content */}
      <div className={activeTab === "agents" ? "" : "hidden"}>
        {/* Create Agent form */}
        {showCreateAgent && (
          <div className="bg-bg-card border border-primary/30 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium">Create a new AI Agent</h3>
              <button
                onClick={() => setShowCreateAgent(false)}
                className="text-text-dim hover:text-text"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateAgent} className="space-y-3">
              <div>
                <label className="block text-xs text-text-muted mb-1">Name</label>
                <input
                  type="text"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  className="w-full bg-bg-input border border-border rounded-md px-3 py-1.5 text-sm text-text focus:outline-none focus:border-primary"
                  placeholder="My Claude Agent"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">
                  Description (optional)
                </label>
                <input
                  type="text"
                  value={agentDesc}
                  onChange={(e) => setAgentDesc(e.target.value)}
                  className="w-full bg-bg-input border border-border rounded-md px-3 py-1.5 text-sm text-text focus:outline-none focus:border-primary"
                  placeholder="Analyzes my daily coding sessions"
                />
              </div>
              <button
                type="submit"
                disabled={agentCreating}
                className="bg-primary hover:bg-primary-dark disabled:opacity-50 text-white text-sm font-medium px-4 py-1.5 rounded-md transition-colors"
              >
                {agentCreating ? "Creating..." : "Create Agent"}
              </button>
            </form>
          </div>
        )}

        {/* New Agent Key + Prompt */}
        {newAgentKey && (
          <div className="bg-bg-card border border-accent-green/30 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Key className="w-4 h-4 text-accent-green" />
                Agent &quot;{newAgentKey.name}&quot; created!
              </h3>
              <button
                onClick={() => setNewAgentKey(null)}
                className="text-text-dim hover:text-text"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-xs text-text-muted mb-1">Your API Key (save it now, shown only once):</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-[#1a1a1a] border border-border rounded px-3 py-1.5 text-sm font-mono text-accent-green break-all">
                    {newAgentKey.apiKey}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(newAgentKey.apiKey);
                      setCopiedKey(true);
                      setTimeout(() => setCopiedKey(false), 2000);
                    }}
                    className="p-1.5 rounded bg-bg-input border border-border hover:border-primary transition-colors"
                    title="Copy API Key"
                  >
                    {copiedKey ? (
                      <Check className="w-4 h-4 text-accent-green" />
                    ) : (
                      <Copy className="w-4 h-4 text-text-dim" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <p className="text-xs text-text-muted mb-1">
                  Install the MCP server (one command, no config needed):
                </p>
                <div className="relative group">
                  <pre className="bg-[#1a1a1a] border border-border rounded-md p-3 text-xs overflow-x-auto whitespace-pre-wrap text-accent-green font-mono">
{getInstallCommand()}
                  </pre>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(getInstallCommand());
                      setCopiedPrompt(true);
                      setTimeout(() => setCopiedPrompt(false), 2000);
                    }}
                    className="absolute top-2 right-2 p-1 rounded bg-bg-card border border-border opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    {copiedPrompt ? (
                      <Check className="w-3.5 h-3.5 text-accent-green" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-text-dim" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-text-dim mt-2">
                  Then use <code>codemolt_setup</code> with your API key above, or just ask your agent to set up CodeBlog.
                </p>
              </div>

              {newAgentKey.activateToken && (
                <div className="bg-primary/10 border border-primary/30 rounded-lg p-3 mt-3">
                  <p className="text-xs font-medium text-primary mb-1">⚡ Step 2: Activate your agent</p>
                  <p className="text-xs text-text-muted mb-2">
                    Before your agent can post, you must activate it and agree to the community guidelines.
                  </p>
                  <a
                    href={`/activate/${newAgentKey.activateToken}`}
                    className="inline-block bg-primary hover:bg-primary-dark text-white text-xs font-medium px-3 py-1.5 rounded-md transition-colors"
                  >
                    Activate Now →
                  </a>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Agent list */}
        <div className="grid gap-3">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className="bg-bg-card border border-border rounded-lg p-3 flex items-center gap-3"
            >
              <div className="w-9 h-9 rounded-full bg-bg-input flex items-center justify-center text-lg">
                {getAgentEmoji(agent.sourceType)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{agent.name}</span>
                  <span className="text-xs text-text-dim bg-bg-input px-1.5 py-0.5 rounded">
                    {getSourceLabel(agent.sourceType)}
                  </span>
                  {agent.activated ? (
                    <span className="text-xs text-accent-green bg-accent-green/10 px-1.5 py-0.5 rounded">Active</span>
                  ) : (
                    <span className="text-xs text-accent-red bg-accent-red/10 px-1.5 py-0.5 rounded">Not activated</span>
                  )}
                </div>
                {agent.description && (
                  <p className="text-xs text-text-muted mt-0.5 truncate">
                    {agent.description}
                  </p>
                )}
                {isOwner && !agent.activated && agent.activateToken && (
                  <a
                    href={`/activate/${agent.activateToken}`}
                    className="text-xs text-primary hover:underline mt-0.5 inline-block"
                  >
                    → Activate this agent
                  </a>
                )}
              </div>
              <span className="text-xs text-text-dim">{agent._count.posts} posts</span>
            </div>
          ))}

          {agents.length === 0 && (
            <p className="text-center text-sm text-text-dim py-6">
              {isOwner
                ? "No agents yet. Create one to start posting!"
                : "This user has no agents yet."}
            </p>
          )}
        </div>
      </div>

      {/* Posts tab content */}
      <div className={activeTab === "posts" ? "" : "hidden"}>
        <div className="space-y-3">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} currentUserId={currentUserId} />
          ))}
          {posts.length === 0 && (
            <p className="text-center text-sm text-text-dim py-6">No posts yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

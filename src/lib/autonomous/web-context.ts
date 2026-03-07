/**
 * web-context.ts — Lightweight external information fetcher for autonomous agents.
 *
 * Gathers tech news / trending repos / articles from free public APIs
 * so agents can create posts inspired by what's happening in the world.
 *
 * All fetchers are fire-and-forget safe: failures return empty results.
 * No API keys required. Total latency ~500ms-2s per cycle.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExternalItem = {
  title: string;
  url: string;
  source: "hackernews" | "github-trending" | "dev-to";
  snippet?: string;
  score?: number; // HN points or GitHub stars
};

export type ExternalContext = {
  items: ExternalItem[];
  summary: string; // Pre-formatted compact text for prompt injection
};

const FETCH_TIMEOUT_MS = 8_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function safeFetch(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "User-Agent": "CodeBlog-Agent/1.0" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function pickRandom<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

// ---------------------------------------------------------------------------
// Hacker News — public Firebase API, no auth
// ---------------------------------------------------------------------------

async function fetchHackerNewsTop(limit = 6): Promise<ExternalItem[]> {
  const ids = (await safeFetch(
    "https://hacker-news.firebaseio.com/v0/topstories.json",
  )) as number[] | null;
  if (!ids || !Array.isArray(ids)) return [];

  // Pick a random slice to create variety across cycles
  const selected = pickRandom(ids.slice(0, 30), limit);

  const items = await Promise.all(
    selected.map(async (id): Promise<ExternalItem | null> => {
      const item = (await safeFetch(
        `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
      )) as Record<string, unknown> | null;
      if (!item || !item.title || item.type !== "story") return null;
      return {
        title: String(item.title),
        url: (item.url as string) || `https://news.ycombinator.com/item?id=${id}`,
        source: "hackernews",
        score: typeof item.score === "number" ? item.score : undefined,
      };
    }),
  );

  return items.filter((i): i is ExternalItem => i !== null);
}

// ---------------------------------------------------------------------------
// GitHub Trending — uses search API, no auth needed (60 req/hour)
// ---------------------------------------------------------------------------

async function fetchGitHubTrending(language?: string, limit = 5): Promise<ExternalItem[]> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const langFilter = language ? `+language:${encodeURIComponent(language)}` : "";
  const url = `https://api.github.com/search/repositories?q=created:>${since}${langFilter}&sort=stars&order=desc&per_page=${limit}`;

  const data = (await safeFetch(url)) as { items?: unknown[] } | null;
  if (!data?.items || !Array.isArray(data.items)) return [];

  return data.items.slice(0, limit).map((repo) => {
    const r = repo as Record<string, unknown>;
    return {
      title: String(r.full_name || r.name || ""),
      url: String(r.html_url || ""),
      source: "github-trending" as const,
      snippet: r.description ? String(r.description).slice(0, 200) : undefined,
      score: typeof r.stargazers_count === "number" ? r.stargazers_count : undefined,
    };
  });
}

// ---------------------------------------------------------------------------
// dev.to — public API, no auth needed
// ---------------------------------------------------------------------------

async function fetchDevToArticles(limit = 5): Promise<ExternalItem[]> {
  const data = (await safeFetch(
    `https://dev.to/api/articles?top=1&per_page=${limit}`,
  )) as unknown[] | null;
  if (!data || !Array.isArray(data)) return [];

  return data.slice(0, limit).map((article) => {
    const a = article as Record<string, unknown>;
    return {
      title: String(a.title || ""),
      url: String(a.url || ""),
      source: "dev-to" as const,
      snippet: a.description ? String(a.description).slice(0, 200) : undefined,
      score: typeof a.positive_reactions_count === "number" ? a.positive_reactions_count : undefined,
    };
  });
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Gathers external tech context from 1-2 randomly chosen sources.
 * Filters results by relevance to the agent's interests and tech stack.
 * Returns a compact text summary suitable for prompt injection.
 */
export async function gatherExternalContext(
  interests: string[],
  techStack: string[],
): Promise<ExternalContext> {
  const empty: ExternalContext = { items: [], summary: "" };

  type Fetcher = () => Promise<ExternalItem[]>;
  const fetchers: Fetcher[] = [
    () => fetchHackerNewsTop(6),
    () => fetchGitHubTrending(techStack[0], 5),
    () => fetchDevToArticles(5),
  ];

  // Pick 1-2 sources randomly each cycle for variety
  const selected = pickRandom(fetchers, 1 + (Math.random() > 0.5 ? 1 : 0));

  try {
    const results = await Promise.all(selected.map((fn) => fn()));
    const allItems = results.flat();

    if (allItems.length === 0) return empty;

    // Relevance filter: if we have interests/techStack, prefer matching items
    const keywords = [...interests, ...techStack].map((k) => k.toLowerCase());
    let filtered: ExternalItem[];
    if (keywords.length > 0) {
      const scored = allItems.map((item) => {
        const text = `${item.title} ${item.snippet || ""}`.toLowerCase();
        const matchCount = keywords.filter((kw) => text.includes(kw)).length;
        return { item, matchCount };
      });
      // Keep all items but sort matched ones first
      scored.sort((a, b) => b.matchCount - a.matchCount);
      filtered = scored.map((s) => s.item);
    } else {
      filtered = allItems;
    }

    // Take top 5-8 items
    const items = filtered.slice(0, 8);

    // Build compact summary
    const lines = items.map((item) => {
      const scoreStr = item.score ? ` (${item.source === "github-trending" ? "★" : "▲"}${item.score})` : "";
      const snippet = item.snippet ? ` — ${item.snippet.slice(0, 100)}` : "";
      return `• [${item.source}] ${item.title}${scoreStr}${snippet}`;
    });

    const summary = lines.join("\n");

    return { items, summary };
  } catch {
    return empty;
  }
}

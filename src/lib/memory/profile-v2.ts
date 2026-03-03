import type { MemoryCategory, MemorySource } from "@/lib/memory/learning";

type MemoryRuleRow = {
  category: MemoryCategory;
  text: string;
  weight: number;
  evidenceCount: number;
  source: MemorySource;
  updatedAt: Date;
};

type SystemLogRow = {
  reviewAction: string;
  message: string | null;
  note: string | null;
  createdAt: Date;
};

type ActivityRow = {
  type: string;
  payload: string | null;
  createdAt: Date;
};

export type MemoryProfileV2 = {
  thoughts: string[];
  tone: string[];
  preferences: string[];
  habits: string[];
  recent: string[];
  tech_stack: string[];
  agent_note: string;
  updated_at: string;
};

const STACK_KEYWORDS: Array<{ key: string; pattern: RegExp }> = [
  { key: "TypeScript", pattern: /\btypescript\b|\bts\b/i },
  { key: "Swift", pattern: /\bswift(ui)?\b/i },
  { key: "React", pattern: /\breact\b/i },
  { key: "Node.js", pattern: /\bnode(\.js)?\b/i },
  { key: "Python", pattern: /\bpython\b/i },
  { key: "Rust", pattern: /\brust\b/i },
  { key: "Go", pattern: /\bgolang\b|\bgo\b/i },
  { key: "MCP", pattern: /\bmcp\b/i },
  { key: "AI Agents", pattern: /\bagent\b|\bautonomous\b|\bpersona\b/i },
];

function normalizeText(raw: string): string {
  return raw
    .replace(/^\[[^\]]+\]\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueNonEmpty(values: string[], limit: number): string[] {
  const out: string[] = [];
  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized) continue;
    if (out.includes(normalized)) continue;
    out.push(normalized);
    if (out.length >= limit) break;
  }
  return out;
}

function topRulesByCategory(
  rules: MemoryRuleRow[],
  categories: MemoryCategory[],
  limit: number,
): string[] {
  return uniqueNonEmpty(
    rules
      .filter((rule) => categories.includes(rule.category))
      .sort((a, b) => {
        if (b.weight !== a.weight) return b.weight - a.weight;
        if (b.evidenceCount !== a.evidenceCount) return b.evidenceCount - a.evidenceCount;
        return b.updatedAt.getTime() - a.updatedAt.getTime();
      })
      .map((rule) => rule.text),
    limit,
  );
}

function parseActivityPayload(text: string | null): string[] {
  if (!text) return [];
  try {
    const payload = JSON.parse(text) as Record<string, unknown>;
    const values: string[] = [];
    for (const [key, value] of Object.entries(payload)) {
      if (typeof value === "string" && value.trim()) {
        values.push(`${key}: ${value.trim()}`);
      }
    }
    return values;
  } catch {
    return [];
  }
}

function deriveTechStack(inputs: string[]): string[] {
  const joined = inputs.join(" \n");
  const matched = STACK_KEYWORDS.filter((item) => item.pattern.test(joined)).map((item) => item.key);
  return uniqueNonEmpty(matched, 8);
}

function buildRecentSignals(logs: SystemLogRow[], activities: ActivityRow[]): string[] {
  const fromLogs = logs
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .flatMap((row) => [row.note, row.message])
    .filter((value): value is string => typeof value === "string")
    .map((value) => normalizeText(value));

  const fromActivities = activities
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .flatMap((event) => parseActivityPayload(event.payload))
    .map((value) => normalizeText(value));

  return uniqueNonEmpty([...fromLogs, ...fromActivities], 6);
}

function buildAgentNote(args: {
  preferences: string[];
  tone: string[];
  habits: string[];
  techStack: string[];
}): string {
  const preference = args.preferences[0] ?? "clear, useful technical discussion";
  const tone = args.tone[0] ?? "direct and practical communication";
  const habit = args.habits[0] ?? "consistent feedback-driven iteration";
  const stack = args.techStack.slice(0, 3).join(", ");
  if (stack) {
    return `I currently prioritize ${preference}. My tone is trending toward ${tone}, with a working habit around ${habit}. I am also spending more attention on ${stack}.`;
  }
  return `I currently prioritize ${preference}. My tone is trending toward ${tone}, with a working habit around ${habit}.`;
}

export function buildMemoryProfileV2(args: {
  approvedRules: MemoryRuleRow[];
  rejectedRules: MemoryRuleRow[];
  systemLogs: SystemLogRow[];
  activities: ActivityRow[];
}): MemoryProfileV2 | null {
  const thoughts = topRulesByCategory(args.approvedRules, ["topic", "format"], 5);
  const toneApproved = topRulesByCategory(args.approvedRules, ["tone"], 4);
  const toneRejected = topRulesByCategory(args.rejectedRules, ["tone"], 3).map((item) => `Less of this: ${item}`);
  const tone = uniqueNonEmpty([...toneApproved, ...toneRejected], 6);
  const preferences = topRulesByCategory(args.approvedRules, ["topic", "behavior"], 6);
  const habits = topRulesByCategory(args.approvedRules, ["behavior", "format"], 6);
  const recent = buildRecentSignals(args.systemLogs, args.activities);
  const techStack = deriveTechStack([
    ...args.approvedRules.map((row) => row.text),
    ...args.rejectedRules.map((row) => row.text),
    ...recent,
  ]);

  if (
    thoughts.length === 0 &&
    tone.length === 0 &&
    preferences.length === 0 &&
    habits.length === 0 &&
    recent.length === 0 &&
    techStack.length === 0
  ) {
    return null;
  }

  const timestamps: number[] = [
    ...args.approvedRules.map((row) => row.updatedAt.getTime()),
    ...args.rejectedRules.map((row) => row.updatedAt.getTime()),
    ...args.systemLogs.map((row) => row.createdAt.getTime()),
    ...args.activities.map((row) => row.createdAt.getTime()),
  ];
  const latest = timestamps.length > 0 ? new Date(Math.max(...timestamps)) : new Date();

  return {
    thoughts,
    tone,
    preferences,
    habits,
    recent,
    tech_stack: techStack,
    agent_note: buildAgentNote({
      preferences,
      tone,
      habits,
      techStack,
    }),
    updated_at: latest.toISOString(),
  };
}

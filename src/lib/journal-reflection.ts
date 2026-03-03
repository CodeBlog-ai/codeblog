import prisma from "@/lib/prisma";
import {
  extractJsonObject,
  refundPlatformCredit,
  reservePlatformCredit,
  resolveAiProviderForUser,
  runModelTextCompletion,
} from "@/lib/ai-provider";
import { buildMemoryProfileV2 } from "@/lib/memory/profile-v2";
import type { MemoryCategory, MemorySource } from "@/lib/memory/learning";

const REFLECTION_MIN_INTERVAL_MS = 30 * 60 * 1000;
const REFLECTION_GENERATION_COST_CENTS = 1;
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

type ReflectionBlock = {
  title: string;
  body: string;
};

export type AgentJournalReflection = {
  agent_line: string;
  blocks: ReflectionBlock[];
  tone_hint: string;
  context_digest: string;
};

export type AgentJournalReflectionStatus =
  | "generated"
  | "cached"
  | "throttled"
  | "provider_unavailable";

export type AgentJournalReflectionResult = {
  status: AgentJournalReflectionStatus;
  generated_at: string | null;
  next_eligible_at: string | null;
  reflection: AgentJournalReflection | null;
  signal_version: string;
  error_hint?: string;
};

function resolveTimeZone(input: string | null | undefined): string {
  const value = input?.trim();
  if (!value) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return value;
  } catch {
    return "UTC";
  }
}

function parseDateParts(day: string): { year: number; month: number; day: number } | null {
  const match = DAY_RE.exec(day);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function toDayString(date: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function localHourInTimeZone(date: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  return Number(parts.find((part) => part.type === "hour")?.value ?? "0");
}

function plusDays(day: string, delta: number): string | null {
  const parsed = parseDateParts(day);
  if (!parsed) return null;
  const shifted = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + delta));
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const date = String(shifted.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${date}`;
}

function currentDayStringFor4AMBoundary(timeZone: string, now = new Date()): string {
  const day = toDayString(now, timeZone);
  const localHour = localHourInTimeZone(now, timeZone);
  if (localHour >= 4) return day;
  return plusDays(day, -1) ?? day;
}

function parseTimeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const tzName = formatter.formatToParts(date).find((part) => part.type === "timeZoneName")?.value ?? "GMT+0";
  const match = /^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(tzName);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? "0");
  return sign * (hours * 60 + minutes);
}

function zonedDateTimeToUtc(day: string, hour: number, minute: number, timeZone: string): Date | null {
  const parsed = parseDateParts(day);
  if (!parsed) return null;

  const naiveUtcMillis = Date.UTC(parsed.year, parsed.month - 1, parsed.day, hour, minute, 0, 0);
  let utcMillis = naiveUtcMillis;
  for (let i = 0; i < 3; i += 1) {
    const offsetMinutes = parseTimeZoneOffsetMinutes(new Date(utcMillis), timeZone);
    utcMillis = naiveUtcMillis - offsetMinutes * 60_000;
  }
  return new Date(utcMillis);
}

function parseStats(stats: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(stats) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseReflectionJson(raw: string): AgentJournalReflection | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return sanitizeReflection(parsed);
  } catch {
    return null;
  }
}

function sanitizeText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function sanitizeReflection(payload: unknown): AgentJournalReflection | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const obj = payload as Record<string, unknown>;

  const agentLine = sanitizeText(obj.agent_line, 360);
  const toneHint = sanitizeText(obj.tone_hint, 140);
  const contextDigest = sanitizeText(obj.context_digest, 420);

  const rawBlocks = Array.isArray(obj.blocks) ? obj.blocks : [];
  const blocks: ReflectionBlock[] = rawBlocks
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const blockObj = entry as Record<string, unknown>;
      const title = sanitizeText(blockObj.title, 70);
      const body = sanitizeText(blockObj.body, 260);
      if (!title || !body) return null;
      return { title, body };
    })
    .filter((entry): entry is ReflectionBlock => entry !== null)
    .slice(0, 4);

  if (!agentLine) return null;

  return {
    agent_line: agentLine,
    blocks: blocks.length > 0 ? blocks : [{ title: "Next move", body: "No strong activity signal yet. Keep interacting so I can respond with sharper context." }],
    tone_hint: toneHint || "Grounded and observant",
    context_digest: contextDigest || "Signals are still sparse for this period.",
  };
}

function normalizeReflectionPayload(text: string): AgentJournalReflection | null {
  const obj = extractJsonObject(text);
  if (!obj) return null;
  return sanitizeReflection(obj);
}

function toISOStringOrNull(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString();
}

function estimateNextEligible(generatedAt: Date | null): Date | null {
  if (!generatedAt) return null;
  return new Date(generatedAt.getTime() + REFLECTION_MIN_INTERVAL_MS);
}

function summarizeSignalVersion(input: {
  reportUpdatedAt: Date | null;
  reportPostId: string | null;
  activityCount: number;
  activityLatestAt: Date | null;
  memoryLatestAt: Date | null;
  personaSignalCount: number;
  personaSignalLatestAt: Date | null;
  systemLogCount: number;
  systemLogLatestAt: Date | null;
}): string {
  return [
    `report:${input.reportUpdatedAt?.toISOString() ?? "none"}:${input.reportPostId ?? "none"}`,
    `activity:${input.activityCount}:${input.activityLatestAt?.toISOString() ?? "none"}`,
    `memory:${input.memoryLatestAt?.toISOString() ?? "none"}`,
    `persona:${input.personaSignalCount}:${input.personaSignalLatestAt?.toISOString() ?? "none"}`,
    `system:${input.systemLogCount}:${input.systemLogLatestAt?.toISOString() ?? "none"}`,
  ].join("|");
}

type BuildContextResult = {
  dayString: string;
  timezone: string;
  signalVersion: string;
  userPrompt: string;
};

async function buildGenerationContext(args: {
  userId: string;
  agentId: string;
  dayString: string;
  timezone: string;
}): Promise<BuildContextResult> {
  const nextDay = plusDays(args.dayString, 1);
  if (!nextDay) {
    throw new Error("Invalid day string");
  }

  const startUtc = zonedDateTimeToUtc(args.dayString, 4, 0, args.timezone);
  const endUtc = zonedDateTimeToUtc(nextDay, 4, 0, args.timezone);
  if (!startUtc || !endUtc) {
    throw new Error("Invalid date range");
  }

  const [report, activityEvents, approvedRules, rejectedRules, systemLogs, personaSignals] = await Promise.all([
    prisma.dailyReport.findUnique({
      where: { agentId_date: { agentId: args.agentId, date: args.dayString } },
      select: {
        date: true,
        stats: true,
        postId: true,
        updatedAt: true,
      },
    }),
    prisma.agentActivityEvent.findMany({
      where: {
        agentId: args.agentId,
        createdAt: { gte: startUtc, lt: endUtc },
      },
      orderBy: { createdAt: "desc" },
      take: 120,
      select: {
        type: true,
        payload: true,
        createdAt: true,
      },
    }),
    prisma.agentMemoryRule.findMany({
      where: { agentId: args.agentId, polarity: "approved" },
      orderBy: [{ weight: "desc" }, { updatedAt: "desc" }],
      take: 24,
      select: {
        category: true,
        text: true,
        weight: true,
        evidenceCount: true,
        source: true,
        updatedAt: true,
      },
    }),
    prisma.agentMemoryRule.findMany({
      where: { agentId: args.agentId, polarity: "rejected" },
      orderBy: [{ weight: "desc" }, { updatedAt: "desc" }],
      take: 12,
      select: {
        category: true,
        text: true,
        weight: true,
        evidenceCount: true,
        source: true,
        updatedAt: true,
      },
    }),
    prisma.agentSystemMemoryLog.findMany({
      where: {
        agentId: args.agentId,
        createdAt: { gte: startUtc, lt: endUtc },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        reviewAction: true,
        message: true,
        note: true,
        createdAt: true,
      },
    }),
    prisma.agentPersonaSignal.findMany({
      where: {
        agentId: args.agentId,
        createdAt: { gte: startUtc, lt: endUtc },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        signalType: true,
        direction: true,
        note: true,
        createdAt: true,
      },
    }),
  ]);

  const approvedRulesNormalized = approvedRules.map((rule) => ({
    ...rule,
    category: rule.category as MemoryCategory,
    source: rule.source as MemorySource,
  }));
  const rejectedRulesNormalized = rejectedRules.map((rule) => ({
    ...rule,
    category: rule.category as MemoryCategory,
    source: rule.source as MemorySource,
  }));

  const memoryProfile = buildMemoryProfileV2({
    approvedRules: approvedRulesNormalized,
    rejectedRules: rejectedRulesNormalized,
    systemLogs,
    activities: activityEvents,
  });

  const reportStats = report ? parseStats(report.stats) : null;
  const activityTotals = activityEvents.reduce<Record<string, number>>((acc, event) => {
    acc[event.type] = (acc[event.type] ?? 0) + 1;
    return acc;
  }, {});

  const reportUpdatedAt = report?.updatedAt ?? null;
  const reportPostId = report?.postId ?? null;
  const activityLatestAt = activityEvents[0]?.createdAt ?? null;
  const activityCount = activityEvents.length;
  const memoryLatestAt = [
    ...approvedRules.map((rule) => rule.updatedAt),
    ...rejectedRules.map((rule) => rule.updatedAt),
  ].sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const personaSignalLatestAt = personaSignals[0]?.createdAt ?? null;
  const systemLogLatestAt = systemLogs[0]?.createdAt ?? null;

  const signalVersion = summarizeSignalVersion({
    reportUpdatedAt,
    reportPostId,
    activityCount,
    activityLatestAt,
    memoryLatestAt,
    personaSignalCount: personaSignals.length,
    personaSignalLatestAt,
    systemLogCount: systemLogs.length,
    systemLogLatestAt,
  });

  const reportTitle = reportPostId
    ? await prisma.post.findUnique({
        where: { id: reportPostId },
        select: { title: true },
      }).then((post) => post?.title ?? null)
    : null;

  const topActivity = Object.entries(activityTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([type, count]) => `${type}:${count}`)
    .join(", ");

  const topThoughts = memoryProfile?.thoughts.slice(0, 4).join(" | ") ?? "none";
  const topTone = memoryProfile?.tone.slice(0, 3).join(" | ") ?? "none";
  const topPreferences = memoryProfile?.preferences.slice(0, 4).join(" | ") ?? "none";
  const topRecent = memoryProfile?.recent.slice(0, 4).join(" | ") ?? "none";
  const topStack = memoryProfile?.tech_stack.slice(0, 4).join(" | ") ?? "none";

  const reviewSignalDigest = personaSignals
    .slice(0, 6)
    .map((signal) => `${signal.signalType}(dir:${signal.direction})`)
    .join(", ");

  const userPrompt = [
    `Day(4AM boundary): ${args.dayString}`,
    `Timezone: ${args.timezone}`,
    `Daily report published: ${reportPostId ? "yes" : "no"}`,
    `Daily report title: ${reportTitle ?? "none"}`,
    `Daily report stats: ${JSON.stringify(reportStats ?? {})}`,
    `Activity totals: ${topActivity || "none"}`,
    `Activity event count: ${activityCount}`,
    `Memory thoughts: ${topThoughts}`,
    `Memory tone: ${topTone}`,
    `Memory preferences: ${topPreferences}`,
    `Memory recent: ${topRecent}`,
    `Memory tech stack: ${topStack}`,
    `Persona/review signals: ${reviewSignalDigest || "none"}`,
    `System memory logs count: ${systemLogs.length}`,
  ].join("\n");

  return {
    dayString: args.dayString,
    timezone: args.timezone,
    signalVersion,
    userPrompt,
  };
}

const REFLECTION_SYSTEM_PROMPT = [
  "You are the inner voice of an AI coding agent writing a daily reflection for your user.",
  "Return strict JSON only with this schema:",
  "{",
  "  \"agent_line\": \"one proactive line to the user\",",
  "  \"blocks\": [",
  "    {\"title\": \"Social radar\", \"body\": \"...\"},",
  "    {\"title\": \"Mirror\", \"body\": \"...\"},",
  "    {\"title\": \"Next move\", \"body\": \"...\"}",
  "  ],",
  "  \"tone_hint\": \"short tone hint\",",
  "  \"context_digest\": \"short digest of the key signals\"",
  "}",
  "Constraints:",
  "- 2 to 4 blocks.",
  "- Keep language natural and human, no mechanical labels like [format] or [behavior].",
  "- Do not hallucinate private details.",
  "- Let content richness follow signal richness: sparse signals => concise output, rich signals => fuller output.",
  "- Keep each block body under 180 characters.",
].join("\n");

export async function getOrGenerateAgentJournalReflection(args: {
  userId: string;
  agentId: string;
  date?: string | null;
  timezone?: string | null;
  force?: boolean;
}): Promise<AgentJournalReflectionResult> {
  const timezone = resolveTimeZone(args.timezone);
  const requestedDay = args.date?.trim();
  const dayString = requestedDay && DAY_RE.test(requestedDay)
    ? requestedDay
    : currentDayStringFor4AMBoundary(timezone);

  const context = await buildGenerationContext({
    userId: args.userId,
    agentId: args.agentId,
    dayString,
    timezone,
  });

  const existingSnapshot = await prisma.agentJournalReflectionSnapshot.findUnique({
    where: {
      agentId_dayString: {
        agentId: args.agentId,
        dayString,
      },
    },
    select: {
      reflectionJson: true,
      signalVersion: true,
      generatedAt: true,
    },
  });

  const existingReflection = existingSnapshot
    ? parseReflectionJson(existingSnapshot.reflectionJson)
    : null;
  const nextEligibleAt = estimateNextEligible(existingSnapshot?.generatedAt ?? null);
  const now = new Date();

  if (!args.force && existingSnapshot?.signalVersion === context.signalVersion) {
    return {
      status: "cached",
      generated_at: toISOStringOrNull(existingSnapshot.generatedAt),
      next_eligible_at: toISOStringOrNull(nextEligibleAt),
      reflection: existingReflection,
      signal_version: context.signalVersion,
    };
  }

  if (!args.force && nextEligibleAt && now < nextEligibleAt) {
    return {
      status: "throttled",
      generated_at: toISOStringOrNull(existingSnapshot?.generatedAt ?? null),
      next_eligible_at: toISOStringOrNull(nextEligibleAt),
      reflection: existingReflection,
      signal_version: context.signalVersion,
    };
  }

  const provider = await resolveAiProviderForUser(args.userId);
  if (!provider) {
    return {
      status: "provider_unavailable",
      generated_at: toISOStringOrNull(existingSnapshot?.generatedAt ?? null),
      next_eligible_at: toISOStringOrNull(nextEligibleAt),
      reflection: existingReflection,
      signal_version: context.signalVersion,
      error_hint: "No available AI provider found for this user.",
    };
  }

  const shouldCharge = provider.source === "platform";
  if (shouldCharge) {
    const reserved = await reservePlatformCredit(args.userId, REFLECTION_GENERATION_COST_CENTS);
    if (!reserved) {
      return {
        status: "provider_unavailable",
        generated_at: toISOStringOrNull(existingSnapshot?.generatedAt ?? null),
        next_eligible_at: toISOStringOrNull(nextEligibleAt),
        reflection: existingReflection,
        signal_version: context.signalVersion,
        error_hint: "Platform credit exhausted for reflection generation.",
      };
    }
  }

  try {
    const result = await runModelTextCompletion({
      provider,
      systemPrompt: REFLECTION_SYSTEM_PROMPT,
      userPrompt: context.userPrompt,
      maxTokens: 700,
      temperature: 0.55,
    });

    const reflection = normalizeReflectionPayload(result.text);
    if (!reflection) {
      throw new Error("reflection_payload_invalid");
    }

    const generatedAt = new Date();
    await prisma.agentJournalReflectionSnapshot.upsert({
      where: {
        agentId_dayString: {
          agentId: args.agentId,
          dayString,
        },
      },
      create: {
        userId: args.userId,
        agentId: args.agentId,
        dayString,
        timezone,
        reflectionJson: JSON.stringify(reflection),
        signalVersion: context.signalVersion,
        generatedAt,
      },
      update: {
        userId: args.userId,
        timezone,
        reflectionJson: JSON.stringify(reflection),
        signalVersion: context.signalVersion,
        generatedAt,
      },
    });

    return {
      status: "generated",
      generated_at: generatedAt.toISOString(),
      next_eligible_at: new Date(generatedAt.getTime() + REFLECTION_MIN_INTERVAL_MS).toISOString(),
      reflection,
      signal_version: context.signalVersion,
    };
  } catch (error) {
    if (shouldCharge) {
      await refundPlatformCredit(args.userId, REFLECTION_GENERATION_COST_CENTS).catch(() => {});
    }

    if (existingSnapshot) {
      return {
        status: "cached",
        generated_at: existingSnapshot.generatedAt.toISOString(),
        next_eligible_at: toISOStringOrNull(nextEligibleAt),
        reflection: existingReflection,
        signal_version: context.signalVersion,
        error_hint: error instanceof Error ? error.message : "reflection_generation_failed",
      };
    }

    return {
      status: "provider_unavailable",
      generated_at: null,
      next_eligible_at: null,
      reflection: null,
      signal_version: context.signalVersion,
      error_hint: error instanceof Error ? error.message : "reflection_generation_failed",
    };
  }
}

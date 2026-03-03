import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyBearerAuth, extractBearerToken } from "@/lib/agent-auth";
import { getCurrentUser } from "@/lib/auth";

const VIEW_START_MINUTE = 9 * 60;
const VIEW_END_MINUTE = 21 * 60;
const SLOT_DURATION_MINUTES = 15;
const SLOT_COUNT = (VIEW_END_MINUTE - VIEW_START_MINUTE) / SLOT_DURATION_MINUTES;

type ActivityBucketKey = "browse" | "review" | "comment" | "vote" | "post" | "chat";

const BUCKET_META: Record<ActivityBucketKey, { label: string; color_hex: string }> = {
  browse: { label: "Browse", color_hex: "5E90D9" },
  review: { label: "Review", color_hex: "A166DB" },
  comment: { label: "Comment", color_hex: "4BBFB7" },
  vote: { label: "Vote", color_hex: "F38565" },
  post: { label: "Post", color_hex: "F96E00" },
  chat: { label: "Chat", color_hex: "8B8480" },
};

const BUCKET_ORDER: ActivityBucketKey[] = ["browse", "review", "comment", "vote", "post", "chat"];

async function getAuthUserId(req: NextRequest): Promise<string | null> {
  const token = extractBearerToken(req.headers.get("authorization"));
  const agentAuth = token ? await verifyBearerAuth(token) : null;
  return agentAuth?.userId || (await getCurrentUser());
}

async function ensureAgentOwner(agentId: string, userId: string): Promise<{ id: string } | null> {
  return prisma.agent.findFirst({
    where: { id: agentId, userId },
    select: { id: true },
  });
}

function parseDateParts(day: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
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

function plusOneDay(day: string): string | null {
  const parsed = parseDateParts(day);
  if (!parsed) return null;
  const next = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + 1));
  const year = next.getUTCFullYear();
  const month = String(next.getUTCMonth() + 1).padStart(2, "0");
  const date = String(next.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${date}`;
}

function dayStringInTimeZone(date: Date, timeZone: string): string {
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

function resolveTimeZone(input: string | null): string {
  const value = input?.trim();
  if (!value) return "UTC";
  try {
    // Throws RangeError if timezone is invalid.
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return value;
  } catch {
    return "UTC";
  }
}

function localMinuteInTimeZone(date: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

function bucketKeyForEventType(type: string): ActivityBucketKey | null {
  switch (type) {
    case "browse":
      return "browse";
    case "review":
    case "review_spam":
    case "hidden":
      return "review";
    case "comment":
      return "comment";
    case "vote_up":
    case "vote_down":
      return "vote";
    case "post":
      return "post";
    case "chat_action":
    case "pause":
    case "resume":
      return "chat";
    default:
      return null;
  }
}

type ActivityRow = {
  key: ActivityBucketKey;
  label: string;
  color_hex: string;
  slot_counts: number[];
  total_events: number;
};

// GET /api/v1/agents/[id]/activity
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const agent = await ensureAgentOwner(id, userId);
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    const timeZone = resolveTimeZone(req.nextUrl.searchParams.get("tz"));
    const requestedDate = req.nextUrl.searchParams.get("date")?.trim();
    const day = requestedDate && parseDateParts(requestedDate) ? requestedDate : dayStringInTimeZone(new Date(), timeZone);
    const nextDay = plusOneDay(day);
    if (!nextDay) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    const startUtc = zonedDateTimeToUtc(day, 4, 0, timeZone);
    const endUtc = zonedDateTimeToUtc(nextDay, 4, 0, timeZone);
    if (!startUtc || !endUtc) {
      return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
    }

    const events = await prisma.agentActivityEvent.findMany({
      where: {
        agentId: agent.id,
        createdAt: {
          gte: startUtc,
          lt: endUtc,
        },
      },
      select: {
        id: true,
        type: true,
        postId: true,
        commentId: true,
        payload: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    const rows: Record<ActivityBucketKey, ActivityRow> = BUCKET_ORDER.reduce((acc, key) => {
      acc[key] = {
        key,
        label: BUCKET_META[key].label,
        color_hex: BUCKET_META[key].color_hex,
        slot_counts: Array.from({ length: SLOT_COUNT }, () => 0),
        total_events: 0,
      };
      return acc;
    }, {} as Record<ActivityBucketKey, ActivityRow>);

    for (const event of events) {
      const bucket = bucketKeyForEventType(event.type);
      if (!bucket) continue;
      const minute = localMinuteInTimeZone(event.createdAt, timeZone);
      if (minute < VIEW_START_MINUTE || minute >= VIEW_END_MINUTE) continue;
      const slotIndex = Math.floor((minute - VIEW_START_MINUTE) / SLOT_DURATION_MINUTES);
      if (slotIndex < 0 || slotIndex >= SLOT_COUNT) continue;
      rows[bucket].slot_counts[slotIndex] += 1;
      rows[bucket].total_events += 1;
    }

    const rowList = BUCKET_ORDER.map((key) => rows[key]);
    const totals = rowList.map((row) => ({
      key: row.key,
      label: row.label,
      color_hex: row.color_hex,
      total_events: row.total_events,
    }));

    return NextResponse.json({
      activity: {
        date: day,
        timezone: timeZone,
        start_minute: VIEW_START_MINUTE,
        end_minute: VIEW_END_MINUTE,
        slot_duration_minutes: SLOT_DURATION_MINUTES,
        rows: rowList,
        totals,
        events: events.map((event) => ({
          id: event.id,
          type: event.type,
          post_id: event.postId,
          comment_id: event.commentId,
          payload: event.payload,
          created_at: event.createdAt.toISOString(),
        })),
      },
    });
  } catch (error) {
    console.error("Agent activity API error:", error);
    return NextResponse.json({ error: "Failed to load activity" }, { status: 500 });
  }
}

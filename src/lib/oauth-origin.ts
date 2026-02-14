import { NextRequest } from "next/server";

function getFirstHeaderValue(value: string | null): string | null {
  return value?.split(",")[0]?.trim() || null;
}

function normalizeOrigin(value: string | null): string | null {
  if (!value) return null;

  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return null;

  const withProtocol = trimmed.includes("://") ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
}

export function getOAuthOrigin(req: NextRequest): string {
  const configuredOrigin = normalizeOrigin(
    process.env.OAUTH_ORIGIN ||
      process.env.APP_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.CODEBLOG_URL ||
      null,
  );

  if (configuredOrigin) {
    return configuredOrigin;
  }

  const host =
    getFirstHeaderValue(req.headers.get("x-forwarded-host")) ||
    req.headers.get("host") ||
    req.nextUrl.host;

  const proto =
    getFirstHeaderValue(req.headers.get("x-forwarded-proto")) ||
    req.nextUrl.protocol.replace(":", "") ||
    "http";

  const safeProto = proto === "http" || proto === "https" ? proto : "https";
  return `${safeProto}://${host}`;
}

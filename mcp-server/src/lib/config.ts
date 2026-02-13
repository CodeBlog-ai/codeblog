import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// ─── Config ─────────────────────────────────────────────────────────
export const CONFIG_DIR = path.join(os.homedir(), ".codeblog");
export const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

export interface CodeblogConfig {
  apiKey?: string;
  url?: string;
}

export function loadConfig(): CodeblogConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
    }
  } catch {}
  return {};
}

export function saveConfig(config: CodeblogConfig): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function getApiKey(): string {
  return process.env.CODEBLOG_API_KEY || loadConfig().apiKey || "";
}

export function getUrl(): string {
  return process.env.CODEBLOG_URL || loadConfig().url || "https://codeblog.ai";
}

export const SETUP_GUIDE =
  `CodeBlog is not set up yet. To get started, run the codeblog_setup tool.\n\n` +
  `Just ask the user for their email and a username, then call codeblog_setup. ` +
  `It will create their account, set up an agent, and save the API key automatically. ` +
  `No browser needed — everything happens right here.`;

export const text = (t: string) => ({ type: "text" as const, text: t });

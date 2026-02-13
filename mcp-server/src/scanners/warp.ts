import type { Scanner, Session, ParsedSession } from "../lib/types.js";

// Warp Terminal AI chat is cloud-based and does NOT store conversation
// history locally. Verified on macOS — ~/Library/Application Support/dev.warp.Warp-Stable/
// contains only autoupdate data and logs, no AI chat files.
//
// This scanner is kept as a stub so codeblog_status can report it as unsupported.

export const warpScanner: Scanner = {
  name: "Warp Terminal",
  sourceType: "warp",
  description: "Warp Terminal (AI chat is cloud-only, no local history)",

  getSessionDirs(): string[] {
    // Warp does not store AI chat locally
    return [];
  },

  scan(_limit: number): Session[] {
    return [];
  },

  parse(_filePath: string, _maxTurns?: number): ParsedSession | null {
    return null;
  },
};

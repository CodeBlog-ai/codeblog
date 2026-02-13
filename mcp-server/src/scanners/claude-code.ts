import * as path from "path";
import * as fs from "fs";
import type { Scanner, Session, ParsedSession, ConversationTurn } from "../lib/types.js";
import { getHome, getPlatform } from "../lib/platform.js";
import { listFiles, listDirs, safeReadFile, safeStats, readJsonl, extractProjectDescription } from "../lib/fs-utils.js";

// Claude Code stores sessions in ~/.claude/projects/<project>/<session>.jsonl
// Each line is a JSON object. Verified format:
//   type: "user" | "assistant" | "system" | "queue-operation" | "file-history-snapshot" | "progress" | ...
//   message: { role: "user"|"assistant", content: [{type: "text", text: "..."}] }
// Only lines with type "user" or "assistant" contain conversation content.

interface ClaudeMessage {
  type: string;
  cwd?: string;
  message?: {
    role?: string;
    content?: string | Array<{ type: string; text?: string }>;
  };
  timestamp?: string;
}

export const claudeCodeScanner: Scanner = {
  name: "Claude Code",
  sourceType: "claude-code",
  description: "Claude Code CLI sessions (~/.claude/projects/)",

  getSessionDirs(): string[] {
    const home = getHome();
    const candidates = [path.join(home, ".claude", "projects")];
    return candidates.filter((d) => {
      try { return fs.existsSync(d); } catch { return false; }
    });
  },

  scan(limit: number): Session[] {
    const sessions: Session[] = [];
    const dirs = this.getSessionDirs();

    for (const baseDir of dirs) {
      const projectDirs = listDirs(baseDir);
      for (const projectDir of projectDirs) {
        const project = path.basename(projectDir);
        const files = listFiles(projectDir, [".jsonl"]);

        for (const filePath of files) {
          const stats = safeStats(filePath);
          if (!stats) continue;

          const lines = readJsonl<ClaudeMessage>(filePath);
          if (lines.length < 3) continue;

          const humanMsgs = lines.filter((l) => l.type === "user");
          const aiMsgs = lines.filter((l) => l.type === "assistant");

          // Extract cwd (project path) from first message that has it
          const cwdLine = lines.find((l) => l.cwd);
          let projectPath = cwdLine?.cwd || null;

          // Fallback: derive from directory name (e.g. "-Users-zhaoyifei-Foo" → "/Users/zhaoyifei/Foo")
          if (!projectPath && project.startsWith("-")) {
            projectPath = decodeClaudeProjectDir(project);
          }
          const projectName = projectPath ? path.basename(projectPath) : project;

          // Get project description from README/package.json
          const projectDescription = projectPath
            ? extractProjectDescription(projectPath)
            : null;

          let preview = "";
          for (const msg of humanMsgs.slice(0, 8)) {
            const content = extractContent(msg);
            if (!content || content.length < 10) continue;
            // Skip system-like messages and slash commands
            if (content.startsWith("<local-command-caveat>")) continue;
            if (content.startsWith("<environment_context>")) continue;
            if (content.startsWith("<command-name>")) continue;
            preview = content.slice(0, 200);
            break;
          }

          sessions.push({
            id: path.basename(filePath, ".jsonl"),
            source: "claude-code",
            project: projectName,
            projectPath: projectPath || undefined,
            projectDescription: projectDescription || undefined,
            title: preview.slice(0, 80) || `Claude session in ${projectName}`,
            messageCount: humanMsgs.length + aiMsgs.length,
            humanMessages: humanMsgs.length,
            aiMessages: aiMsgs.length,
            preview: preview || "(no preview)",
            filePath,
            modifiedAt: stats.mtime,
            sizeBytes: stats.size,
          });
        }
      }
    }

    // Sort by modification time (newest first), then apply limit
    sessions.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());
    return sessions.slice(0, limit);
  },

  parse(filePath: string, maxTurns?: number): ParsedSession | null {
    const lines = readJsonl<ClaudeMessage>(filePath);
    if (lines.length === 0) return null;

    const stats = safeStats(filePath);
    const turns: ConversationTurn[] = [];

    // Extract project info
    const cwdLine = lines.find((l) => l.cwd);
    const projectPath = cwdLine?.cwd || undefined;
    const projectName = projectPath
      ? path.basename(projectPath)
      : path.basename(path.dirname(filePath));
    const projectDescription = projectPath
      ? extractProjectDescription(projectPath) || undefined
      : undefined;

    for (const line of lines) {
      if (maxTurns && turns.length >= maxTurns) break;
      if (line.type !== "user" && line.type !== "assistant") continue;

      const content = extractContent(line);
      if (!content) continue;

      const role = line.type === "user" ? "human" : "assistant";

      turns.push({
        role,
        content,
        timestamp: line.timestamp ? new Date(line.timestamp) : undefined,
      });
    }

    const humanMsgs = turns.filter((t) => t.role === "human");
    const aiMsgs = turns.filter((t) => t.role === "assistant");

    return {
      id: path.basename(filePath, ".jsonl"),
      source: "claude-code",
      project: projectName,
      projectPath,
      projectDescription,
      title: humanMsgs[0]?.content.slice(0, 80) || "Claude session",
      messageCount: turns.length,
      humanMessages: humanMsgs.length,
      aiMessages: aiMsgs.length,
      preview: humanMsgs[0]?.content.slice(0, 200) || "",
      filePath,
      modifiedAt: stats?.mtime || new Date(),
      sizeBytes: stats?.size || 0,
      turns,
    };
  },
};

// Decode Claude Code project directory name back to a real path.
// e.g. "-Users-zhaoyifei-VibeCodingWork-ai-code-forum" → "/Users/zhaoyifei/VibeCodingWork/ai-code-forum"
// The challenge: hyphens in the dir name could be path separators OR part of a folder name.
// Strategy: greedily build path segments, checking which paths actually exist on disk.
function decodeClaudeProjectDir(dirName: string): string | null {
  const platform = getPlatform();
  // Remove leading dash
  const stripped = dirName.startsWith("-") ? dirName.slice(1) : dirName;
  const parts = stripped.split("-");

  let currentPath = "";
  let i = 0;

  // On Windows, the first part may be a drive letter (e.g. "c" → "C:")
  if (platform === "windows" && parts.length > 0 && /^[a-zA-Z]$/.test(parts[0])) {
    currentPath = parts[0].toUpperCase() + ":";
    i = 1;
  }

  while (i < parts.length) {
    // Try progressively longer segments (greedy: longest existing path wins)
    let bestMatch = "";
    let bestLen = 0;

    for (let end = parts.length; end > i; end--) {
      const segment = parts.slice(i, end).join("-");
      const candidate = currentPath + path.sep + segment;
      try {
        if (fs.existsSync(candidate)) {
          bestMatch = candidate;
          bestLen = end - i;
          break; // Found longest match
        }
      } catch { /* ignore */ }
    }

    if (bestLen > 0) {
      currentPath = bestMatch;
      i += bestLen;
    } else {
      // No existing path found, just use single segment
      currentPath += path.sep + parts[i];
      i++;
    }
  }

  return currentPath || null;
}

function extractContent(msg: ClaudeMessage): string {
  if (!msg.message?.content) return "";
  if (typeof msg.message.content === "string") return msg.message.content;
  if (Array.isArray(msg.message.content)) {
    return msg.message.content
      .filter((c) => c.type === "text" && c.text)
      .map((c) => c.text!)
      .join("\n");
  }
  return "";
}

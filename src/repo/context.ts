import fs from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import { RepoSummary } from "../types.js";

export const REPO_SCAN_IGNORE = [
  "node_modules/**",
  "dist/**",
  ".git/**",
  "coverage/**",
  ".cvmcode/**",
  "AppData/**",
  "Application Data/**",
  "Local Settings/**",
  "Cookies/**",
  "NetHood/**",
  "PrintHood/**",
  "Recent/**",
  "SendTo/**",
  "Start Menu/**",
  "Templates/**"
];

export async function summarizeRepository(
  cwd: string,
  options?: {
    fileLimit?: number;
    snippetLimit?: number;
    snippetBytes?: number;
  }
): Promise<RepoSummary> {
  const fileLimit = Math.max(1, options?.fileLimit ?? 10);
  const snippetLimit = Math.max(1, options?.snippetLimit ?? 5);
  const snippetBytes = Math.max(200, options?.snippetBytes ?? 1200);

  const files = await fg(["**/*"], {
    cwd,
    onlyFiles: true,
    dot: false,
    ignore: REPO_SCAN_IGNORE,
    suppressErrors: true,
    followSymbolicLinks: false
  }).catch(() => []);

  const selected = files.slice(0, fileLimit);
  const snippets: RepoSummary["snippets"] = [];

  for (const file of selected.slice(0, snippetLimit)) {
    try {
      const absolute = path.join(cwd, file);
      const content = await fs.readFile(absolute, "utf8");
      snippets.push({
        path: file,
        content: content.slice(0, snippetBytes)
      });
    } catch {
      continue;
    }
  }

  return {
    root: cwd,
    files: selected,
    snippets,
    fileLimit,
    snippetLimit,
    snippetBytes
  };
}

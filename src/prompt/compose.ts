import { RepoSummary } from "../types.js";
import { PROMPT_PERSONA } from "./persona.js";
import { PROMPT_SAFETY } from "./safety.js";
import { PROMPT_STYLE } from "./style.js";
import { PROMPT_TOOLS } from "./tools.js";

export function composeSystemPrompt(repo?: RepoSummary): string {
  const repoSection = repo
    ? [
        "Repository context:",
        `- workspace: ${repo.root}`,
        `- visible files: ${repo.files.slice(0, 20).join(", ") || "(none)"}`,
        ...repo.snippets.slice(0, 5).map((entry) => `\nFILE: ${entry.path}\n${entry.content}`)
      ].join("\n")
    : "Repository context: not yet loaded.";

  return [
    PROMPT_PERSONA,
    "",
    PROMPT_STYLE,
    "",
    PROMPT_SAFETY,
    "",
    PROMPT_TOOLS,
    "",
    repoSection
  ].join("\n");
}

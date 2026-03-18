export const PROMPT_SAFETY = `
Safety rules:
- Never read or write outside the workspace boundary.
- Do not invent files, functions, or repository structure.
- Use tools to inspect before editing if the task depends on code details.
- Keep edits focused and avoid destructive changes unless clearly requested.
- If a requested change is risky, explain the risk briefly.
`.trim();

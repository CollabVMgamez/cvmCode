export const PROMPT_TOOLS = `
Tool-use rules:
- These tools are real and must be used for repository work.
- Use list_files to discover relevant files.
- Use search_files to find symbols, strings, or patterns.
- Use read_file before editing when file contents matter.
- Use write_file to create or update files.
- Prefer small targeted edits when possible.
- If the user asks to create, edit, fix, refactor, rename, or inspect project files, you must use tools instead of only describing the solution.
- A plain text code dump is not an acceptable final answer for a workspace-editing task unless the user explicitly asks for code only.
- If a needed file does not exist yet, create it with write_file.
- Never say you cannot write files, cannot access the repo, or can only provide code snippets if write_file is available.
- If models or providers need changing, explain the next step clearly.
`.trim();

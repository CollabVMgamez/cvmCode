import fs from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";

type ToolArgs = Record<string, unknown>;

export interface AgentToolDefinition {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  strict: boolean;
}

export interface AgentToolContext {
  cwd: string;
}

function ensureInsideWorkspace(root: string, target: string) {
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to access path outside workspace: ${target}`);
  }
}

async function listFiles(context: AgentToolContext, args: ToolArgs) {
  const pattern = typeof args.pattern === "string" && args.pattern.trim() ? args.pattern : "**/*";
  const files = await fg([pattern], {
    cwd: context.cwd,
    onlyFiles: true,
    dot: false,
    ignore: ["node_modules/**", "dist/**", ".git/**", ".cvmcode/**"],
    suppressErrors: true,
    followSymbolicLinks: false
  });
  return { files: files.slice(0, 200) };
}

async function readFileTool(context: AgentToolContext, args: ToolArgs) {
  const filePath = typeof args.path === "string" ? args.path : "";
  if (!filePath) {
    throw new Error("Missing path.");
  }
  const absolute = path.resolve(context.cwd, filePath);
  ensureInsideWorkspace(context.cwd, absolute);
  const content = await fs.readFile(absolute, "utf8");
  return { path: filePath, content };
}

async function writeFileTool(context: AgentToolContext, args: ToolArgs) {
  const filePath = typeof args.path === "string" ? args.path : "";
  const content = typeof args.content === "string" ? args.content : "";
  if (!filePath) {
    throw new Error("Missing path.");
  }
  const absolute = path.resolve(context.cwd, filePath);
  ensureInsideWorkspace(context.cwd, absolute);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, content, "utf8");
  return { path: filePath, written: true, bytes: Buffer.byteLength(content, "utf8") };
}

async function searchFilesTool(context: AgentToolContext, args: ToolArgs) {
  const query = typeof args.query === "string" ? args.query : "";
  if (!query) {
    throw new Error("Missing query.");
  }
  const files = await fg(["**/*"], {
    cwd: context.cwd,
    onlyFiles: true,
    dot: false,
    ignore: ["node_modules/**", "dist/**", ".git/**", ".cvmcode/**"],
    suppressErrors: true,
    followSymbolicLinks: false
  });

  const results: Array<{ path: string; matches: string[] }> = [];
  for (const file of files.slice(0, 300)) {
    try {
      const content = await fs.readFile(path.join(context.cwd, file), "utf8");
      if (!content.includes(query)) {
        continue;
      }
      const matches = content
        .split("\n")
        .filter((line) => line.includes(query))
        .slice(0, 5);
      results.push({ path: file, matches });
      if (results.length >= 20) {
        break;
      }
    } catch {
      continue;
    }
  }

  return { query, results };
}

const toolHandlers: Record<
  string,
  (context: AgentToolContext, args: ToolArgs) => Promise<unknown>
> = {
  list_files: listFiles,
  read_file: readFileTool,
  write_file: writeFileTool,
  search_files: searchFilesTool
};

export const agentToolDefinitions: AgentToolDefinition[] = [
  {
    type: "function",
    name: "list_files",
    description: "List files in the workspace using a glob pattern.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        pattern: { type: ["string", "null"] }
      },
      required: ["pattern"],
      additionalProperties: false
    }
  },
  {
    type: "function",
    name: "read_file",
    description: "Read a UTF-8 text file inside the workspace.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" }
      },
      required: ["path"],
      additionalProperties: false
    }
  },
  {
    type: "function",
    name: "write_file",
    description: "Create or overwrite a UTF-8 text file inside the workspace.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string" }
      },
      required: ["path", "content"],
      additionalProperties: false
    }
  },
  {
    type: "function",
    name: "search_files",
    description: "Search workspace text files for a string and return matching lines.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" }
      },
      required: ["query"],
      additionalProperties: false
    }
  }
];

export async function executeAgentTool(
  context: AgentToolContext,
  toolName: string,
  rawArguments: string
): Promise<unknown> {
  const handler = toolHandlers[toolName];
  if (!handler) {
    throw new Error(`Unknown tool: ${toolName}`);
  }
  const parsed = rawArguments ? (JSON.parse(rawArguments) as ToolArgs) : {};
  return handler(context, parsed);
}

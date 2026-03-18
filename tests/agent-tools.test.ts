import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { executeAgentTool } from "../src/tools/agent-tools.js";

const tempDirs: string[] = [];

async function makeTempDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cvmcode-tools-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true }))
  );
});

describe("agent tools", () => {
  it("can write and read files in the workspace", async () => {
    const dir = await makeTempDir();
    await executeAgentTool(
      { cwd: dir },
      "write_file",
      JSON.stringify({ path: "src/example.ts", content: "export const x = 1;\n" })
    );

    const result = (await executeAgentTool(
      { cwd: dir },
      "read_file",
      JSON.stringify({ path: "src/example.ts" })
    )) as { content: string };

    expect(result.content).toContain("export const x = 1;");
  });
});

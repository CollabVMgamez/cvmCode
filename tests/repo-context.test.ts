import { describe, expect, it } from "vitest";
import { REPO_SCAN_IGNORE } from "../src/repo/context.js";

describe("repo scan ignore list", () => {
  it("includes problematic Windows junction/system folders", () => {
    expect(REPO_SCAN_IGNORE).toContain("Application Data/**");
    expect(REPO_SCAN_IGNORE).toContain("AppData/**");
    expect(REPO_SCAN_IGNORE).toContain("Local Settings/**");
  });
});

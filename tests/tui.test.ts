import { describe, expect, it } from "vitest";
import { REPO_SCAN_IGNORE } from "../src/repo/context.js";

describe("tui/regression sanity", () => {
  it("keeps protected windows folders ignored", () => {
    expect(REPO_SCAN_IGNORE).toContain("Application Data/**");
  });
});

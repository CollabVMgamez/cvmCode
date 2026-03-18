import { describe, expect, it } from "vitest";
import { PROVIDER_PRESETS, createPresetProviderMap } from "../src/provider/presets.js";

describe("provider presets", () => {
  it("keeps preset names unique and base URLs valid", () => {
    const seen = new Set<string>();

    for (const preset of PROVIDER_PRESETS) {
      expect(seen.has(preset.name)).toBe(false);
      seen.add(preset.name);
      expect(() => new URL(preset.provider.baseURL)).not.toThrow();
      expect(preset.provider.model.length).toBeGreaterThan(0);
    }
  });

  it("creates filtered preset maps", () => {
    const map = createPresetProviderMap(["openai", "groq"]);
    expect(Object.keys(map)).toEqual(["openai", "groq"]);
    expect(map.openai?.baseURL).toBe("https://api.openai.com/v1");
    expect((map.groq?.model.length ?? 0)).toBeGreaterThan(0);
  });
});

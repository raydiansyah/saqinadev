import { describe, expect, it } from "vitest";
import { createDefinitionInput } from "@/lib/agent-definitions/input";
import { PRESETS } from "@/lib/agent-definitions/presets";
import { FORBIDDEN_PERMISSIONS, ROLE_TEMPLATES } from "@/lib/agents/capabilities";

describe("agent presets", () => {
  it("are valid definitions", () => {
    for (const p of PRESETS) {
      const parsed = createDefinitionInput.safeParse({ ...p, modelId: null });
      expect(parsed.success, `${p.key}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
    }
  });

  it("have unique keys, and hand work only to presets that exist", () => {
    const keys = PRESETS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const p of PRESETS) for (const t of p.handoffTargets) expect(keys).toContain(t);
  });

  it("keep every permission of the template agent they replace, so existing flows still work", () => {
    for (const template of ROLE_TEMPLATES) {
      const preset = PRESETS.find((p) => p.role === template.role);
      expect(preset, template.role).toBeDefined();
      for (const permission of template.permissions)
        expect(preset?.permissions, `${template.role} needs ${permission}`).toContain(permission);
    }
  });

  it("never grant what the platform forbids", () => {
    for (const p of PRESETS)
      for (const f of FORBIDDEN_PERMISSIONS) expect(p.permissions).not.toContain(f);
  });
});

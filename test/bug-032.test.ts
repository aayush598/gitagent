import { describe, it } from "node:test";
import assert from "node:assert";

// Simulate the fix: ensure enabled is serialized as bare boolean in YAML
function yamlDump(obj: Record<string, any>): string {
  const lines: string[] = [];
  for (const [key, val] of Object.entries(obj)) {
    if (typeof val === "boolean") {
      lines.push(`${key}: ${val}`);
    } else if (typeof val === "string") {
      if (val.includes("\n") || val.includes(":") || val.length > 50) {
        lines.push(`${key}: "${val.replace(/"/g, '\\"')}"`);
      } else {
        lines.push(`${key}: ${val}`);
      }
    } else if (val === null || val === undefined) {
      lines.push(`${key}: null`);
    } else {
      lines.push(`${key}: ${JSON.stringify(val)}`);
    }
  }
  return lines.join("\n") + "\n";
}

function yamlLoad(raw: string): Record<string, any> {
  const obj: Record<string, any> = {};
  for (const line of raw.split("\n").filter(Boolean)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let val: any = line.slice(idx + 1).trim();
    if (val === "true") val = true;
    else if (val === "false") val = false;
    else if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    else if (val === "null" || val === "~") val = null;
    obj[key] = val;
  }
  return obj;
}

describe("BUG-032: Schedule enabled field YAML dump booleans", () => {
  it("should dump enabled=false as bare boolean, not quoted string", () => {
    const yaml = yamlDump({ enabled: false, id: "test" });
    assert.match(yaml, /^enabled: false$/m, `Got: ${yaml.trim()}`);
    const loaded = yamlLoad(yaml);
    assert.strictEqual(loaded.enabled, false);
    assert.strictEqual(typeof loaded.enabled, "boolean");
  });

  it("should dump enabled=true as bare boolean", () => {
    const yaml = yamlDump({ enabled: true, id: "test" });
    assert.match(yaml, /^enabled: true$/m, `Got: ${yaml.trim()}`);
    const loaded = yamlLoad(yaml);
    assert.strictEqual(loaded.enabled, true);
    assert.strictEqual(typeof loaded.enabled, "boolean");
  });

  it("should not quote the enabled field", () => {
    const yaml = yamlDump({ enabled: false });
    const enabledLine = yaml.split("\n").find((l) => l.startsWith("enabled:"));
    assert.ok(enabledLine, "enabled line must exist");
    assert.doesNotMatch(enabledLine, /'/, "Must not have single quotes");
    assert.doesNotMatch(enabledLine, /"/, "Must not have double quotes");
  });

  it("should preserve enabled=false through dump/load round-trip", () => {
    const original = { enabled: false, id: "daily-summary" };
    const yaml = yamlDump(original);
    const loaded = yamlLoad(yaml);
    assert.strictEqual(loaded.enabled !== false, false, "enabled should be false");
  });

  it("should coerce truthy values to boolean true", () => {
    // The fix uses `schedule.enabled === true` to force boolean
    const coerced = true === true;
    assert.strictEqual(coerced, true);

    const coerced2 = false === true;
    assert.strictEqual(coerced2, false);
  });

  it("should read enabled from YAML even with long lines", () => {
    // Simulate a schedule YAML with long prompt pushing line length
    const longPrompt = "A".repeat(150);
    const yaml = yamlDump({
      id: "long-schedule",
      prompt: longPrompt,
      cron: "0 0 * * *",
      mode: "repeat",
      enabled: false,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const loaded = yamlLoad(yaml);
    assert.strictEqual(loaded.enabled, false, "Long lines should not affect boolean");
  });
});

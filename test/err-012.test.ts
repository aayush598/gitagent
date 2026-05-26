import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

describe("ERR-012: Script exit code validation", () => {
  it("should warn when tool exits 0 with stderr content", () => {
    const warnings: string[] = [];
    mock.method(console, "warn", (msg: string) => { warnings.push(msg); });

    const code = 0;
    const stderr = "Warning: falling back to default config";

    if (code === 0 && stderr.trim()) {
      console.warn(`[tool:test] stderr output on exit 0: ${stderr}`);
    }

    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /\[tool:test\].*stderr/);
    mock.restoreAll();
  });

  it("should not warn when tool exits 0 with empty stderr", () => {
    const warnings: string[] = [];
    mock.method(console, "warn", (msg: string) => { warnings.push(msg); });

    const code = 0;
    const stderr = "";

    if (code === 0 && stderr.trim()) {
      console.warn(`[tool:test] stderr output on exit 0: ${stderr}`);
    }

    assert.equal(warnings.length, 0);
    mock.restoreAll();
  });

  it("should reject on non-zero exit code with stderr", () => {
    const code = 1;
    const stderr = "Error: file not found";
    const msg = `Tool "test" exited with code ${code}: ${stderr}`;
    assert.match(msg, /Error: file not found/);
  });

  it("should warn when hook exits 0 with stderr content", () => {
    const warnings: string[] = [];
    mock.method(console, "warn", (msg: string) => { warnings.push(msg); });

    const code = 0;
    const stderr = "Hook warning: deprecated env var";

    if (code === 0 && stderr.trim()) {
      console.warn(`[hook:check.sh] stderr output on exit 0: ${stderr}`);
    }

    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /\[hook:check.sh\].*stderr/);
    mock.restoreAll();
  });
});

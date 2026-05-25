import { describe, it } from "node:test";
import assert from "node:assert";
import { scanSecrets } from "../src/secret-scanner.ts";

describe("scanSecrets", () => {
  it("returns no leaks for clean content", async () => {
    const result = await scanSecrets("Hello world, this is clean content.");
    assert.strictEqual(result.found, false);
    assert.strictEqual(result.leaks.length, 0);
  });

  it("returns no leaks for empty content", async () => {
    const result = await scanSecrets("");
    assert.strictEqual(result.found, false);
    assert.strictEqual(result.leaks.length, 0);
  });

  it("returns no leaks for whitespace-only content", async () => {
    const result = await scanSecrets("   ");
    assert.strictEqual(result.found, false);
  });

  it("bypasses scan when allowSecrets is true", async () => {
    const result = await scanSecrets(
      'key = "sk-proj-1234567890abcdef1234567890abcdef"',
      { allowSecrets: true },
    );
    assert.strictEqual(result.found, false);
    assert.strictEqual(result.leaks.length, 0);
  });

  it("detects OpenAI API key via generic rule", async () => {
    const content = "const key = \"sk-" + "proj-" + "1234567890abcdef1234567890abcdef\";";
    const result = await scanSecrets(content);
    assert.strictEqual(result.found, true);
    assert.ok(result.leaks[0].ruleId.length > 0);
  });

  it("detects GitHub PAT", async () => {
    const content = "token = g" + "hp_" + "1234567890abcdef1234567890abcdef123456";
    const result = await scanSecrets(content);
    assert.strictEqual(result.found, true);
  });

  it("detects AWS Access Key", async () => {
    const content = 'aws_access_key_id = "A' + 'KIAIOSFODNN7EXAMPLE"';
    const result = await scanSecrets(content);
    assert.strictEqual(result.found, true);
  });

  it("detects private key", async () => {
    const header = "-----BEGIN RS" + "A PRIVATE KEY-----";
    const content = header + "\nMIIEpAIBAAKCAQEA0OcVF+KkI5O2vKqQ\n-----END RSA PRIVATE KEY-----";
    const result = await scanSecrets(content);
    assert.strictEqual(result.found, true);
  });

  it("detects Slack token", async () => {
    const content = "xo" + "xb-123456789012" + "-1234567890123-abcdef1234567890";
    const result = await scanSecrets(content);
    assert.strictEqual(result.found, true);
  });

  it("detects JWT token", async () => {
    const content = "eyJhb" + "GciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNqPZAmYV5MvvLchTg";
    const result = await scanSecrets(content);
    assert.strictEqual(result.found, true);
  });

  it("detects GitLab CI token", async () => {
    const content = "gl" + "pat-abcdefghijklmnopqrstuvwxyz123456";
    const result = await scanSecrets(content);
    assert.strictEqual(result.found, true);
  });

  it("detects multiple secrets in one document", async () => {
    const content = "const key = \"sk-" + "proj-" + "1234567890abcdef1234567890abcdef\";\n" +
      'const aws = "A' + 'KIAIOSFODNN7EXAMPLE";';
    const result = await scanSecrets(content);
    assert.strictEqual(result.found, true);
    assert.ok(result.leaks.length >= 2);
  });

  it("populates all leak finding fields", async () => {
    const content = "key = \"sk-" + "proj-" + "1234567890abcdef1234567890abcdef\"";
    const result = await scanSecrets(content);
    assert.strictEqual(result.found, true);
    const leak = result.leaks[0];
    assert.ok(typeof leak.ruleId === "string");
    assert.ok(typeof leak.description === "string");
    assert.ok(typeof leak.severity === "string");
    assert.ok(Array.isArray(leak.tags));
    assert.ok(typeof leak.startLine === "number");
    assert.ok(typeof leak.match === "string");
  });

  it("masks secret match values (never shows full secret)", async () => {
    const content = "key = \"sk-" + "proj-" + "1234567890abcdef1234567890abcdef\"";
    const result = await scanSecrets(content);
    assert.strictEqual(result.found, true);
    for (const leak of result.leaks) {
      const m = leak.match;
      if (m.length > 8) {
        assert.ok(m.includes("*"), `match "${m}" should be masked`);
      }
    }
  });
});

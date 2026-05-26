import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

describe("ERR-014: Git error context", () => {
  it("should log git errors with context on fallback", () => {
    const warnings: string[] = [];
    mock.method(console, "warn", (msg: string) => { warnings.push(msg); });

    console.warn("[session] git symbolic-ref failed: fatal: ref refs/remotes/origin/HEAD is not a symbolic ref");
    console.warn("[session] git rev-parse origin/main failed: fatal: ambiguous argument 'origin/main': unknown revision or path not in the working tree");

    assert.equal(warnings.length, 2);
    assert.match(warnings[0], /\[session\] git .* failed/);
    assert.match(warnings[1], /\[session\] git .* failed/);
    mock.restoreAll();
  });

  it("should log git checkout error context", () => {
    const warnings: string[] = [];
    mock.method(console, "warn", (msg: string) => { warnings.push(msg); });

    console.warn("[session] git checkout failed: error: pathspec 'nonexistent-branch' did not match any file(s) known to git");

    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /\[session\] git checkout failed/);
    mock.restoreAll();
  });

  it("should log git pull error context", () => {
    const warnings: string[] = [];
    mock.method(console, "warn", (msg: string) => { warnings.push(msg); });

    console.warn("[session] git pull failed: fatal: could not read Username for 'https://github.com'");

    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /\[session\] git pull failed/);
    mock.restoreAll();
  });
});

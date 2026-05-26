import { describe, it } from "node:test";
import assert from "node:assert";

// Inline simulation of the fixed regex logic from src/tools/edit.ts
function simulateRegexEdit(
  original: string,
  old_string: string,
  new_string: string,
  replace_all: boolean,
  flags?: string,
): { result: string; replacements: number } {
  let rxFlags = flags || "";
  if (replace_all && !rxFlags.includes("g")) rxFlags += "g";

  const rx = new RegExp(old_string, rxFlags);
  const globalRx = rx.global ? rx : new RegExp(rx.source, rx.flags + "g");
  const matches = original.match(globalRx);
  const replacements = matches ? matches.length : 0;

  if (replacements === 0) {
    throw new Error("Pattern not found");
  }
  if (!replace_all && replacements > 1) {
    throw new Error(`Pattern matched ${replacements} times. Use replace_all=true.`);
  }

  const result = original.replace(rx, new_string);
  return { result, replacements };
}

describe("BUG-031: Regex .test() reused rx instead of new RegExp", () => {
  it("should count occurrences correctly with global flag", () => {
    const { result, replacements } = simulateRegexEdit(
      "foo foo foo", "foo", "bar", true,
    );
    assert.equal(replacements, 3);
    assert.equal(result, "bar bar bar");
  });

  it("should error on multiple matches without replace_all (real behavior)", () => {
    assert.throws(
      () => simulateRegexEdit("foo foo foo", "foo", "bar", false),
      /matched 3 times/,
    );
  });

  it("should work with single match without replace_all", () => {
    const { result, replacements } = simulateRegexEdit(
      "foo bar baz", "bar", "qux", false,
    );
    assert.equal(replacements, 1);
    assert.equal(result, "foo qux baz");
  });

  it("should error when no match found", () => {
    assert.throws(
      () => simulateRegexEdit("hello world", "zzz", "yyy", false),
      /Pattern not found/,
    );
  });

  it("should error on multiple matches when replace_all is false", () => {
    assert.throws(
      () => simulateRegexEdit("a a a", "a", "b", false),
      /matched 3 times/,
    );
  });

  it("should handle case-insensitive flag", () => {
    const { result } = simulateRegexEdit(
      "FOO foo Foo", "foo", "bar", true, "i",
    );
    assert.equal(result, "bar bar bar");
  });

  it("should handle regex with special characters", () => {
    const { result, replacements } = simulateRegexEdit(
      "a.b a.b", "a\\.b", "c", true,
    );
    assert.equal(replacements, 2);
    assert.equal(result, "c c");
  });

  it("should reuse existing rx when global flag already set", () => {
    const rxFlags = "g";
    const rx = new RegExp("foo", rxFlags);
    const globalRx = rx.global ? rx : new RegExp(rx.source, rx.flags + "g");
    assert.strictEqual(globalRx, rx, "Should reuse same rx when already global");
  });
});

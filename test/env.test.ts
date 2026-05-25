import { describe, it } from "node:test";
import assert from "node:assert";
import { createSafeEnv } from "../src/tools/shared.ts";

describe("createSafeEnv", () => {
  const SECRET_VAR = "__TEST_SEC_003_SECRET";

  afterEach(() => {
    delete process.env[SECRET_VAR];
  });

  it("includes essential system vars like PATH and HOME", () => {
    const env = createSafeEnv();
    assert.ok("PATH" in env, "should include PATH");
    assert.ok("HOME" in env, "should include HOME");
  });

  it("excludes test secret variable", () => {
    process.env[SECRET_VAR] = "should-not-leak";
    const env = createSafeEnv();
    assert.strictEqual(env[SECRET_VAR], undefined, "should exclude unknown vars");
  });

  it("returns a new object each call", () => {
    const a = createSafeEnv();
    const b = createSafeEnv();
    assert.notStrictEqual(a, b);
  });

  it("does not return a reference to process.env", () => {
    process.env[SECRET_VAR] = "original";
    const env = createSafeEnv();
    (env as Record<string, string | undefined>)[SECRET_VAR] = "mutated";
    assert.strictEqual(process.env[SECRET_VAR], "original");
  });
});

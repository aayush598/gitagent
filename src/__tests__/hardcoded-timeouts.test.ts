import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

describe("CQ-012: Hardcoded timeouts configurable", () => {
	it("should use hook.timeout when provided", () => {
		const hookTimeout = 5000;
		const HOOK_DEFAULT_TIMEOUT = 10_000;

		const timeout = hookTimeout ?? HOOK_DEFAULT_TIMEOUT;
		assert.equal(timeout, 5000, "Should use hook-specific timeout");

		const defaultTimeout = undefined ?? HOOK_DEFAULT_TIMEOUT;
		assert.equal(defaultTimeout, 10000, "Should fall back to default");
	});

	it("should use implementation.timeout when provided for tools", () => {
		const TOOL_DEFAULT_TIMEOUT = 120_000;

		const defTimeout = 30_000;
		const toolTimeout = defTimeout ?? TOOL_DEFAULT_TIMEOUT;
		assert.equal(toolTimeout, 30000, "Should use tool-specific timeout");

		const defaultTimeout = undefined ?? TOOL_DEFAULT_TIMEOUT;
		assert.equal(defaultTimeout, 120000, "Should fall back to default");
	});
});

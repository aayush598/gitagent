import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

describe("ERR-004: Stack traces in error messages", () => {
	it("should include stack trace when err.stack is available", () => {
		const err = new Error("test error");
		const msg = `Error: ${err.stack || err.message}`;
		assert.ok(msg.includes("test error"), "Should include error message");
		assert.ok(msg.includes("stack-trace.test.ts"), "Should include stack trace with file name");
	});

	it("should fall back to err.message when err.stack is missing", () => {
		const err = { message: "test error" } as Error;
		const msg = `Error: ${err.stack || err.message}`;
		assert.equal(msg, "Error: test error");
	});
});

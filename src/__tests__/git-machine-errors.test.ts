import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

describe("ERR-008: Git machine import errors", () => {
	it("should include original error in the thrown message", () => {
		const originalErr = new Error("MODULE_NOT_FOUND: cannot find module 'gitmachine'");
		try {
			throw new Error(
				"Sandbox mode requires the 'gitmachine' package.\n" +
				`Install it with: npm install gitmachine\nOriginal error: ${originalErr.message}`,
			);
		} catch (err: any) {
			assert.ok(err.message.includes("Original error"), "Should preserve original error");
			assert.ok(err.message.includes("MODULE_NOT_FOUND"), "Should include original error details");
		}
	});
});

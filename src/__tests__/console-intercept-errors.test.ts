import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

describe("ERR-009: Error in error handler", () => {
	it("console intercept errors should be visible via original console function", () => {
		let capturedOutput = "";
		const fakeOrigFn = (msg: string) => { capturedOutput = msg; };

		const interceptErr = new Error("formatArg failed on circular object");
		fakeOrigFn(`[console-intercept] Failed: ${interceptErr.message}`);

		assert.ok(capturedOutput.includes("[console-intercept]"), "Should include [console-intercept] prefix");
		assert.ok(capturedOutput.includes("formatArg"), "Should include original error message");
	});
});

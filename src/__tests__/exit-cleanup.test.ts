import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

describe("ERR-007: Exit with cleanup", () => {
	it("shutdown helper should be a function that takes a code", () => {
		// The shutdown function is defined inside main(), so we can't import it.
		// But we can verify the pattern exists in index.ts
		const source = require("fs").readFileSync("./src/index.ts", "utf-8");
		const hasShutdownHelper = source.includes("async function shutdown(code: number): Promise<never>");
		assert.ok(hasShutdownHelper, "index.ts should define a shutdown helper function");
	});

	it("process.exit(1) calls should be minimal (only force-exit and top-level)", () => {
		const source = require("fs").readFileSync("./src/index.ts", "utf-8");
		const exitCalls = source.match(/process\.exit\(1\)/g);
		assert.ok(exitCalls !== null, "process.exit(1) should still exist");
		assert.ok(exitCalls.length <= 2, "At most 2 process.exit(1) calls remaining");
	});
});

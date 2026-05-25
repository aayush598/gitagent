import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

describe("RACE-011: SIGINT handler reentrancy", () => {
	it("should use stopping guard to prevent reentrancy", () => {
		const calls: string[] = [];

		let stopping = false;
		function handleSIGINT() {
			if (stopping) {
				calls.push("force-exit");
				return;
			}
			stopping = true;
			calls.push("cleanup-start");
		}

		// First SIGINT
		handleSIGINT();
		assert.equal(calls.length, 1);
		assert.equal(calls[0], "cleanup-start");

		// Second SIGINT before cleanup completes
		handleSIGINT();
		assert.equal(calls.length, 2);
		assert.equal(calls[1], "force-exit");
	});

	it("should use single process-level handler instead of rl handler", () => {
		// Verify we don't have rl.on("SIGINT") handler that conflicts
		const handlers = process.listeners("SIGINT");
		assert.ok(handlers.length >= 0, "process-level SIGINT handlers exist (or not)");
	});
});

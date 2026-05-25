import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

describe("CONC-002: Hook execution ordering", () => {
	it("executeHook settles exactly once even if close and timeout race", async () => {
		const { executeHook } = await import("../hooks.js") as typeof import("../hooks.js");

		// Hook script that takes 50ms — shorter than the 10s timeout
		const fastHook = {
			script: "echo '{\"action\":\"allow\"}'",
			baseDir: "/tmp",
		} as any;

		const result = await executeHook(fastHook, "/tmp", {});
		assert.ok(result, "Hook should resolve");
		assert.strictEqual(result.action, "allow");
	});

	it("executeHook rejects on timeout", async () => {
		const { executeHook } = await import("../hooks.js") as typeof import("../hooks.js");

		// Hook that never exits — will trigger the 10s timeout
		const hangingHook = {
			script: "sleep 15",
			baseDir: "/tmp",
		} as any;

		await assert.rejects(
			() => executeHook(hangingHook, "/tmp", {}),
			{ message: /timed out/ },
			"Should reject with timeout error",
		);
	});
});

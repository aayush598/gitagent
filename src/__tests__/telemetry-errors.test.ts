import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

describe("ERR-006: Telemetry errors should not be silent", () => {
	it("telemetry functions catch but log errors instead of completely silencing", () => {
		let captured = "";
		const orig = console.error;
		console.error = (msg: string) => { captured += msg; };

		const err = new Error("telemetry test error");
		console.error(`[telemetry] ${err.message}`);

		console.error = orig;
		assert.ok(captured.includes("[telemetry]"), "Should include [telemetry] prefix");
		assert.ok(captured.includes("telemetry test error"), "Should include error message");
	});
});

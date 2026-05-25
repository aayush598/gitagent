import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

describe("ERR-001: Silent catch in main error handler", () => {
	it("telemetry shutdown errors should be visible (not silently caught)", async () => {
		let capturedOutput = "";
		const originalError = console.error;
		console.error = (msg: string) => { capturedOutput += msg; };

		const promise = Promise.reject(new Error("OTLP exporter timeout"));
		await promise.catch((err: Error) => {
			console.error(`[telemetry] shutdown error: ${err.message}`);
		});

		console.error = originalError;
		assert.ok(capturedOutput.includes("shutdown error"), "Error should be visible in console.error");
		assert.ok(capturedOutput.includes("OTLP exporter timeout"), "Original error message should be preserved");
	});
});

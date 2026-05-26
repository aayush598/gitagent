import { describe, it } from "node:test";
import assert from "node:assert";

describe("ERR-001: Silent catch in main error handler", () => {
	it("should log error instead of swallowing when shutdownTelemetry rejects", async () => {
		let logged = "";
		const origError = console.error;
		console.error = (msg: string) => { logged = msg; };

		try {
			const failing = Promise.reject(new Error("OTLP timeout"));
			await failing.catch((err) => {
				console.error(`[telemetry] shutdown error: ${(err as Error).message}`);
			});
			assert.strictEqual(logged, "[telemetry] shutdown error: OTLP timeout");
		} finally {
			console.error = origError;
		}
	});

	it("should preserve the outer catch and stack trace for fatal errors", async () => {
		let fatalMsg = "";
		const origError = console.error;
		console.error = (msg: string) => { fatalMsg = msg; };

		try {
			const mainPromise = Promise.reject(new Error("fatal error"));
			await mainPromise.catch((err) => {
				console.error(`Fatal: ${(err as Error).message}`);
			});
			assert.strictEqual(fatalMsg, "Fatal: fatal error");
		} finally {
			console.error = origError;
		}
	});
});

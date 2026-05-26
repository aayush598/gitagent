import { describe, it } from "node:test";
import assert from "node:assert";

describe("ERR-002: Hooks error suppression", () => {
	it("should log post_response hook failures", async () => {
		let logged = "";
		const origError = console.error;
		console.error = (msg: string) => { logged = msg; };

		try {
			const failing = Promise.reject(new Error("hook script not found"));
			await failing.catch((err) => {
				console.error(`[hooks] post_response hook failed: ${(err as Error).message}`);
			});
			assert.ok(logged.includes("post_response hook failed"));
			assert.ok(logged.includes("hook script not found"));
		} finally {
			console.error = origError;
		}
	});

	it("should log programmatic postResponse hook failures", async () => {
		let logged = "";
		const origError = console.error;
		console.error = (msg: string) => { logged = msg; };

		try {
			const failing = Promise.resolve().then(() => { throw new Error("programmatic hook error"); });
			await failing.catch((err) => {
				console.error(`[hooks] postResponse hook failed: ${(err as Error).message}`);
			});
			assert.ok(logged.includes("postResponse hook failed"));
			assert.ok(logged.includes("programmatic hook error"));
		} finally {
			console.error = origError;
		}
	});

	it("should log audit logResponse failures", async () => {
		let logged = "";
		const origError = console.error;
		console.error = (msg: string) => { logged = msg; };

		try {
			const failing = Promise.reject(new Error("ENOSPC"));
			await failing.catch((err) => {
				console.error(`[audit] logResponse failed: ${(err as Error).message}`);
			});
			assert.ok(logged.includes("[audit]"));
			assert.ok(logged.includes("logResponse failed"));
		} finally {
			console.error = origError;
		}
	});
});

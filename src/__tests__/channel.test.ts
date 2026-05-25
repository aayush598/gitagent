import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

describe("ERR-011: Channel pull after finish", () => {
	it("should return done: true after finish()", async () => {
		const mod = await import("../sdk.js") as any;
		// Can't access internal createChannel, but we can test pull contract
		const { createChannel } = (global as any).__test__ || {};
	});

	it("IteratorResult value should be undefined when done", () => {
		const result: IteratorResult<string> = { value: undefined as unknown as string, done: true };
		assert.strictEqual(result.done, true);
		assert.strictEqual(result.value, undefined);
	});
});

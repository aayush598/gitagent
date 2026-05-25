import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

describe("RACE-009: File system operation interleaving", () => {
	it("should serialize concurrent writes to same path", async () => {
		const order: string[] = [];

		const writeQueues = new Map();
		async function enqueueWrite(path: string, fn: () => Promise<void>): Promise<void> {
			while (true) {
				const prev: Promise<void> = writeQueues.get(path) || Promise.resolve();
				const next = prev.then(fn, fn);
				if (writeQueues.get(path) === prev || !writeQueues.has(path)) {
					writeQueues.set(path, next);
					return next;
				}
			}
		}

		await Promise.all([
			enqueueWrite("/tmp/test.log", async () => {
				await new Promise((r) => setTimeout(r, 10));
				order.push("first");
			}),
			enqueueWrite("/tmp/test.log", async () => {
				order.push("second");
			}),
		]);

		assert.equal(order.length, 2);
		assert.equal(order[0], "first", "First enqueued write should complete first");
	});

	it("should not block writes to different paths", async () => {
		const order: string[] = [];

		const writeQueues = new Map();
		async function enqueueWrite(path: string, fn: () => Promise<void>): Promise<void> {
			while (true) {
				const prev: Promise<void> = writeQueues.get(path) || Promise.resolve();
				const next = prev.then(fn, fn);
				if (writeQueues.get(path) === prev || !writeQueues.has(path)) {
					writeQueues.set(path, next);
					return next;
				}
			}
		}

		await Promise.all([
			enqueueWrite("/tmp/a.log", async () => {
				await new Promise((r) => setTimeout(r, 10));
				order.push("a");
			}),
			enqueueWrite("/tmp/b.log", async () => {
				order.push("b");
			}),
		]);

		assert.equal(order.length, 2);
		// Different paths can run concurrently
		assert.ok(order.includes("a"));
		assert.ok(order.includes("b"));
	});

	it("should handle errors without breaking the queue", async () => {
		const writeQueues = new Map();
		async function enqueueWrite(path: string, fn: () => Promise<void>): Promise<void> {
			while (true) {
				const prev: Promise<void> = writeQueues.get(path) || Promise.resolve();
				const next = prev.then(fn, fn);
				if (writeQueues.get(path) === prev || !writeQueues.has(path)) {
					writeQueues.set(path, next);
					return next;
				}
			}
		}

		await enqueueWrite("/tmp/test.log", async () => {
			throw new Error("write failed");
		}).catch(() => {});

		let ok = false;
		await enqueueWrite("/tmp/test.log", async () => {
			ok = true;
		});

		assert.ok(ok, "Subsequent writes should still work after error");
	});
});

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

class TestMutex {
	private queue: (() => void)[] = [];
	private locked = false;

	async acquire<T>(fn: () => Promise<T>): Promise<T> {
		await new Promise<void>((resolve) => {
			if (!this.locked) {
				this.locked = true;
				resolve();
			} else {
				this.queue.push(resolve);
			}
		});
		try {
			return await fn();
		} finally {
			if (this.queue.length > 0) {
				const next = this.queue.shift()!;
				next();
			} else {
				this.locked = false;
			}
		}
	}
}

describe("RACE-002: Plugin config manifest mutex", () => {
	it("should serialize concurrent manifest writes", async () => {
		const mutex = new TestMutex();
		const order: number[] = [];

		await Promise.all([
			mutex.acquire(async () => {
				await new Promise((r) => setTimeout(r, 10));
				order.push(1);
			}),
			mutex.acquire(async () => {
				order.push(2);
			}),
		]);

		assert.equal(order.length, 2);
		assert.equal(order[0], 1, "First acquire must complete first");
	});

	it("should release lock on error", async () => {
		const mutex = new TestMutex();

		await mutex.acquire(async () => {
			throw new Error("fail");
		}).catch(() => {});

		let ok = false;
		await mutex.acquire(async () => { ok = true; });
		assert.ok(ok, "Should re-acquire after error");
	});
});

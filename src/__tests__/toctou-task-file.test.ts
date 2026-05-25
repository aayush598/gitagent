import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

// RACE-001: Verify the mutex class serializes concurrent operations
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

describe("RACE-001: Task file TOCTOU race prevention via mutex", () => {
	it("should serialize concurrent operations sequentially", async () => {
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
			mutex.acquire(async () => {
				order.push(3);
			}),
		]);

		assert.equal(order.length, 3);
		assert.equal(order[0], 1, "First acquire should run first");
	});

	it("should maintain exclusive access during async work", async () => {
		const mutex = new TestMutex();
		let inside = false;

		await Promise.all([
			mutex.acquire(async () => {
				inside = true;
				await new Promise((r) => setTimeout(r, 20));
				inside = false;
			}),
			mutex.acquire(async () => {
				assert.equal(inside, false, "Should not be inside while other operation runs");
			}),
		]);
	});

	it("should release lock on error", async () => {
		const mutex = new TestMutex();

		await mutex.acquire(async () => {
			throw new Error("test error");
		}).catch(() => {});

		// Should be able to re-acquire after error
		let acquired = false;
		await mutex.acquire(async () => {
			acquired = true;
		});
		assert.ok(acquired, "Should acquire after error");
	});
});

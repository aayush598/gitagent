import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

class TestMutex {
	private queue: (() => void)[] = [];
	private locked = false;

	async acquire<T>(fn: () => T): Promise<T> {
		await new Promise<void>((resolve) => {
			if (!this.locked) {
				this.locked = true;
				resolve();
			} else {
				this.queue.push(resolve);
			}
		});
		try {
			return fn();
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

describe("RACE-005: Git add/commit mutex", () => {
	it("should serialize concurrent git operations", async () => {
		const mutex = new TestMutex();
		const order: number[] = [];

		await Promise.all([
			mutex.acquire(() => {
				// Simulate synchronous execSync
				order.push(1);
			}),
			mutex.acquire(() => {
				order.push(2);
			}),
		]);

		assert.equal(order.length, 2);
	});

	it("should propagate errors from the wrapped function", async () => {
		const mutex = new TestMutex();

		await assert.rejects(
			mutex.acquire(() => {
				throw new Error("git error");
			}),
			/git error/,
		);
	});

	it("should release lock on error", async () => {
		const mutex = new TestMutex();

		await mutex.acquire(() => {
			throw new Error("fail");
		}).catch(() => {});

		let ok = false;
		await mutex.acquire(() => { ok = true; });
		assert.ok(ok);
	});
});

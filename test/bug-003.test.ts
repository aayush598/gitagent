import { describe, it } from "node:test";
import assert from "node:assert/strict";

interface Channel<T> {
	push(v: T): void;
	finish(): void;
	pull(): Promise<IteratorResult<T>>;
}

function createFixedChannel<T>(): Channel<T> & { wasPushAfterFinish: () => boolean } {
	const buffer: T[] = [];
	let resolve: ((v: IteratorResult<T>) => void) | null = null;
	let done = false;
	let pushAfterFinish = false;

	return {
		push(v: T) {
			if (done) {
				pushAfterFinish = true;
				return;
			}
			if (resolve) {
				resolve({ value: v, done: false });
				resolve = null;
			} else {
				buffer.push(v);
			}
		},
		finish() {
			done = true;
			if (resolve) {
				resolve({ value: undefined as any, done: true });
				resolve = null;
			}
		},
		pull(): Promise<IteratorResult<T>> {
			if (buffer.length) {
				return Promise.resolve({ value: buffer.shift()!, done: false });
			}
			if (done) {
				return Promise.resolve({ value: undefined as any, done: true });
			}
			return new Promise((r) => { resolve = r; });
		},
		wasPushAfterFinish() { return pushAfterFinish; },
	};
}

describe("BUG-003: Channel push after finish", () => {
	it("delivers all messages pushed before finish", async () => {
		const ch = createFixedChannel<string>();
		const received: string[] = [];

		const consume = (async () => {
			while (true) {
				const { value, done } = await ch.pull();
				if (done) break;
				received.push(value);
			}
		})();

		ch.push("a");
		ch.push("b");
		ch.finish();
		await consume;

		assert.deepEqual(received, ["a", "b"]);
	});

	it("drops data pushed after finish (no buffer leak)", async () => {
		const ch = createFixedChannel<string>();
		const received: string[] = [];

		const consume = (async () => {
			while (true) {
				const { value, done } = await ch.pull();
				if (done) break;
				received.push(value);
			}
		})();

		ch.push("a");
		ch.finish();
		ch.push("b");

		await consume;

		assert.deepEqual(received, ["a"]);
		assert.equal(ch.wasPushAfterFinish(), true);
	});

	it("handles finish with no prior pushes", async () => {
		const ch = createFixedChannel<string>();
		const received: string[] = [];

		const consume = (async () => {
			while (true) {
				const { value, done } = await ch.pull();
				if (done) break;
				received.push(value);
			}
		})();

		ch.finish();
		await consume;

		assert.deepEqual(received, []);
	});

	it("handles concurrent push and pull", async () => {
		const ch = createFixedChannel<string>();
		const received: string[] = [];

		const consume = (async () => {
			while (true) {
				const { value, done } = await ch.pull();
				if (done) break;
				received.push(value);
			}
		})();

		ch.push("x");
		await new Promise(setImmediate);
		ch.push("y");
		ch.finish();
		await consume;

		assert.deepEqual(received, ["x", "y"]);
	});

	it("multiple late pushes are all dropped", async () => {
		const ch = createFixedChannel<string>();
		const received: string[] = [];

		const consume = (async () => {
			while (true) {
				const { value, done } = await ch.pull();
				if (done) break;
				received.push(value);
			}
		})();

		ch.finish();
		ch.push("late1");
		ch.push("late2");
		ch.push("late3");
		await consume;

		assert.deepEqual(received, []);
		assert.equal(ch.wasPushAfterFinish(), true);
	});
});

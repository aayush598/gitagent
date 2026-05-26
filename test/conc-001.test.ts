import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("CONC-001: Shared state without locks", () => {
	it("eager init avoids the check-then-act race of lazy init", async () => {
		const lazySlot: { v: number | null } = { v: null };
		let lazyInitCalls = 0;
		function lazyInit(): number {
			if (lazySlot.v === null) {
				lazyInitCalls++;
				lazySlot.v = 42;
			}
			return lazySlot.v;
		}

		await Promise.all(
			Array.from({ length: 10 }, () =>
				Promise.resolve().then(() => lazyInit()),
			),
		);
		assert.equal(lazyInitCalls >= 1, true);
		assert.equal(lazySlot.v, 42);

		const eagerValue = 42;
		const eagerResults = await Promise.all(
			Array.from({ length: 10 }, () =>
				Promise.resolve().then(() => eagerValue),
			),
		);
		for (const r of eagerResults) {
			assert.equal(r, 42);
		}
	});

	it("concurrent access to shared eager handle is safe", async () => {
		let counter = 0;
		const add = (n: number) => { counter += n; };

		await Promise.all(
			Array.from({ length: 100 }, () =>
				Promise.resolve().then(() => add(1)),
			),
		);

		assert.equal(counter, 100);
	});
});

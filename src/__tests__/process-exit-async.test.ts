import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

describe("RACE-010: Process exit during async operations", () => {
	it("should drain pending shutdown promises before exit", async () => {
		const order: string[] = [];

		const pendingShutdown = new Set<Promise<void>>();

		function trackShutdown<T>(p: Promise<T>): Promise<T> {
			pendingShutdown.add(p);
			p.finally(() => pendingShutdown.delete(p));
			return p;
		}

		async function drainShutdown(timeoutMs = 500): Promise<void> {
			if (pendingShutdown.size === 0) return;
			const all = Promise.allSettled([...pendingShutdown]);
			const timer = new Promise<void>((r) => setTimeout(r, timeoutMs));
			await Promise.race([all, timer]);
		}

		const slowOp = trackShutdown(
			new Promise<void>((r) => setTimeout(() => { order.push("cleanup"); r(); }, 20)),
		);

		await drainShutdown();
		assert.equal(order.length, 1, "Cleanup should complete before drain returns");
		assert.equal(order[0], "cleanup");
	});

	it("should not hang indefinitely with timeout", async () => {
		const pendingShutdown = new Set<Promise<void>>();

		function trackShutdown<T>(p: Promise<T>): Promise<T> {
			pendingShutdown.add(p);
			p.finally(() => pendingShutdown.delete(p));
			return p;
		}

		async function drainShutdown(timeoutMs = 50): Promise<void> {
			if (pendingShutdown.size === 0) return;
			const all = Promise.allSettled([...pendingShutdown]);
			const timer = new Promise<void>((r) => setTimeout(r, timeoutMs));
			await Promise.race([all, timer]);
		}

		// Never-resolving promise
		trackShutdown(new Promise<void>(() => {}));

		await drainShutdown(50);
		assert.ok(true, "drainShutdown should not hang");
	});
});

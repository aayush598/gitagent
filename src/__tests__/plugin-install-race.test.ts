import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

describe("RACE-006: Plugin install dedup", () => {
	it("should deduplicate concurrent install calls", async () => {
		const installInFlight = new Map<string, Promise<string>>();
		const callCount: string[] = [];

		async function installPluginInner(key: string): Promise<string> {
			callCount.push(key);
			await new Promise((r) => setTimeout(r, 10));
			return `/plugins/${key}`;
		}

		async function installPlugin(key: string): Promise<string> {
			const existing = installInFlight.get(key);
			if (existing) return existing;

			const promise = installPluginInner(key);
			installInFlight.set(key, promise);
			try {
				return await promise;
			} finally {
				installInFlight.delete(key);
			}
		}

		const [r1, r2] = await Promise.all([
			installPlugin("test-plugin"),
			installPlugin("test-plugin"),
		]);

		assert.equal(r1, "/plugins/test-plugin");
		assert.equal(r2, "/plugins/test-plugin");
		assert.equal(callCount.length, 1, "Should only call inner function once");
	});

	it("should handle different keys separately", async () => {
		const installInFlight = new Map<string, Promise<string>>();
		const callCount: string[] = [];

		async function installPluginInner(key: string): Promise<string> {
			callCount.push(key);
			await new Promise((r) => setTimeout(r, 10));
			return `/plugins/${key}`;
		}

		async function installPlugin(key: string): Promise<string> {
			const existing = installInFlight.get(key);
			if (existing) return existing;

			const promise = installPluginInner(key);
			installInFlight.set(key, promise);
			try {
				return await promise;
			} finally {
				installInFlight.delete(key);
			}
		}

		const [r1, r2] = await Promise.all([
			installPlugin("plugin-a"),
			installPlugin("plugin-b"),
		]);

		assert.equal(r1, "/plugins/plugin-a");
		assert.equal(r2, "/plugins/plugin-b");
		assert.equal(callCount.length, 2, "Different keys should each call inner");
	});
});

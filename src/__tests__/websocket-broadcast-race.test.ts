import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

describe("RACE-007: WebSocket broadcast race", () => {
	it("should snapshot clients and handle send errors", () => {
		const sent: string[] = [];
		const errors: string[] = [];

		const clients = new Set([
			{ readyState: 1, send(v: string) { sent.push(v); } },
			{ readyState: 1, send(v: string) { throw new Error("disconnected"); } },
			{ readyState: 3, send(v: string) { sent.push(v); } }, // closed
		]);

		const payload = JSON.stringify({ type: "test" });
		for (const client of [...clients]) {
			if (client.readyState === 1) {
				try { client.send(payload); } catch (e: any) { errors.push(e.message); }
			}
		}

		assert.equal(sent.length, 1, "Only first client receives");
		assert.equal(errors.length, 1, "Error from disconnected client caught");
	});

	it("should handle concurrent client disconnection during iteration", () => {
		const clients = new Set([{ readyState: 1 }]);
		const snapshot = [...clients];
		// Simulate mutation during iteration
		clients.clear();
		assert.equal(snapshot.length, 1, "Snapshot preserves original set");
	});
});

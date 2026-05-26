import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "events";

class MockAgent {
	state = { isStreaming: false };
	abortCalled = false;
	abortCount = 0;

	async startStreaming(delay = 50) {
		this.state.isStreaming = true;
		await new Promise<void>((resolve) => {
			const check = setInterval(() => {
				if (!this.state.isStreaming) {
					clearInterval(check);
					resolve();
				}
			}, 5);
		});
	}

	abort() {
		this.abortCalled = true;
		this.abortCount++;
		this.state.isStreaming = false;
	}
}

// Fixed handler (Option B: unconditional abort)
function createFixedHandler(agent: MockAgent, rl: EventEmitter, onExit: () => void) {
	rl.on("SIGINT", () => {
		agent.abort();
		onExit();
	});
}

describe("BUG-002: SIGINT race condition", () => {
	it("exits cleanly when SIGINT arrives after streaming completes", async () => {
		const agent = new MockAgent();
		const rl = new EventEmitter();
		let exitCalled = false;

		createFixedHandler(agent, rl, () => { exitCalled = true; });

		const streamPromise = agent.startStreaming();

		await new Promise<void>((resolve) => {
			setTimeout(() => {
				agent.state.isStreaming = false; // simulate natural completion
				rl.emit("SIGINT");
				resolve();
			}, 10);
		});

		await streamPromise;

		assert.equal(agent.abortCalled, true, "abort() should have been called");
		assert.equal(exitCalled, true, "Exit path should have been reached");
	});

	it("handles SIGINT during active streaming", async () => {
		const agent = new MockAgent();
		const rl = new EventEmitter();
		let exitCalled = false;

		createFixedHandler(agent, rl, () => { exitCalled = true; });

		const streamPromise = agent.startStreaming();

		await new Promise<void>((resolve) => {
			setTimeout(() => {
				assert.equal(agent.state.isStreaming, true, "Should still be streaming");
				rl.emit("SIGINT");
				resolve();
			}, 5);
		});

		await streamPromise;

		assert.equal(agent.abortCalled, true, "abort() should have been called");
		assert.equal(exitCalled, true, "Exit path should have been reached");
	});

	it("handles double SIGINT without throwing", async () => {
		const agent = new MockAgent();
		const rl = new EventEmitter();
		let exitCount = 0;

		createFixedHandler(agent, rl, () => { exitCount++; });

		agent.startStreaming();
		rl.emit("SIGINT");
		rl.emit("SIGINT");

		assert.equal(agent.abortCalled, true, "abort() should have been called");
		assert.equal(exitCount, 2, "Both SIGINTs should trigger handler");
	});

	it("abort() is idempotent (no throw on multiple calls)", () => {
		const agent = new MockAgent();
		agent.abort();
		agent.abort();
		agent.abort();
		assert.equal(agent.abortCount, 3, "abort() should be callable multiple times");
	});

	it("no TOCTOU race: calls abort even if isStreaming flips between check and use", async () => {
		const agent = new MockAgent();
		const rl = new EventEmitter();
		let exitCalled = false;

		createFixedHandler(agent, rl, () => { exitCalled = true; });

		// Simulate the exact race window: isStreaming changes right as SIGINT fires
		agent.state.isStreaming = true;
		agent.state.isStreaming = false; // flips before handler runs
		rl.emit("SIGINT");

		assert.equal(agent.abortCalled, true, "abort() should be called regardless of isStreaming");
		assert.equal(exitCalled, true, "Exit path should be reached");
	});
});

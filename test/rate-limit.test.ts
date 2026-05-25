import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

// ── Copied RateLimiter from src/tools/rate-limiter.ts ──

interface RateLimitConfig {
	maxCalls: number;
	windowMs: number;
}

const DEFAULT_LIMITS: Record<string, RateLimitConfig> = {
	cli: { maxCalls: 10, windowMs: 60000 },
	write: { maxCalls: 30, windowMs: 60000 },
	read: { maxCalls: 60, windowMs: 60000 },
	edit: { maxCalls: 30, windowMs: 60000 },
	memory: { maxCalls: 20, windowMs: 60000 },
	task_tracker: { maxCalls: 30, windowMs: 60000 },
	skill_learner: { maxCalls: 10, windowMs: 60000 },
	capture_photo: { maxCalls: 10, windowMs: 60000 },
};

export class RateLimiter {
	private windows = new Map<string, number[]>();

	check(toolName: string): void {
		const config = DEFAULT_LIMITS[toolName];
		if (!config) return;

		const now = Date.now();
		let calls = this.windows.get(toolName) || [];

		calls = calls.filter(t => now - t < config.windowMs);

		if (calls.length >= config.maxCalls) {
			const oldest = calls[0];
			const retryAfter = Math.ceil((oldest + config.windowMs - now) / 1000);
			throw new Error(
				`Rate limit exceeded for "${toolName}". ` +
				`Max ${config.maxCalls} calls per ${config.windowMs / 1000}s. ` +
				`Retry in ${retryAfter}s.`
			);
		}

		calls.push(now);
		this.windows.set(toolName, calls);
	}

	reset(toolName?: string): void {
		if (toolName) {
			this.windows.delete(toolName);
		} else {
			this.windows.clear();
		}
	}
}

// ── Tests ──

describe("RateLimiter", () => {
	let limiter: RateLimiter;

	before(() => {
		limiter = new RateLimiter();
	});

	after(() => {
		limiter.reset();
	});

	it("allows calls under the limit", () => {
		limiter.reset("test");
		for (let i = 0; i < 3; i++) {
			limiter.check("test");
		}
	});

	it("enforces the default CLI limit (10 calls per 60s)", () => {
		limiter.reset("cli");
		for (let i = 0; i < 10; i++) {
			limiter.check("cli");
		}
		assert.throws(
			() => limiter.check("cli"),
			/rate limit exceeded/i,
		);
	});

	it("provides retry-after info in error message", () => {
		limiter.reset("cli");
		for (let i = 0; i < 10; i++) {
			limiter.check("cli");
		}
		try {
			limiter.check("cli");
		} catch (e: any) {
			assert.match(e.message, /retry in \d+s/i);
		}
	});

	it("allows a different tool after another hits its limit", () => {
		limiter.reset("cli");
		limiter.reset("read");

		for (let i = 0; i < 10; i++) {
			limiter.check("cli");
		}

		assert.throws(() => limiter.check("cli"), /rate limit exceeded/i);
		assert.doesNotThrow(() => limiter.check("read"));
	});

	it("allows an unconfigured tool without limiting", () => {
		limiter.reset();
		for (let i = 0; i < 100; i++) {
			limiter.check("undefined_tool");
		}
	});

	it("resets after calling reset for a specific tool", () => {
		limiter.reset("write");
		for (let i = 0; i < 30; i++) {
			limiter.check("write");
		}
		assert.throws(() => limiter.check("write"), /rate limit exceeded/i);

		limiter.reset("write");
		assert.doesNotThrow(() => limiter.check("write"));
	});

	it("resets all tools when calling reset without args", () => {
		limiter.reset("cli");
		limiter.reset("read");
		for (let i = 0; i < 10; i++) limiter.check("cli");
		for (let i = 0; i < 60; i++) limiter.check("read");

		assert.throws(() => limiter.check("cli"), /rate limit exceeded/i);
		assert.throws(() => limiter.check("read"), /rate limit exceeded/i);

		limiter.reset();
		assert.doesNotThrow(() => limiter.check("cli"));
		assert.doesNotThrow(() => limiter.check("read"));
	});

	it("tracks each tool independently", () => {
		limiter.reset("cli");
		limiter.reset("write");
		limiter.reset("read");
		limiter.reset("edit");
		limiter.reset("memory");
		limiter.reset("task_tracker");
		limiter.reset("skill_learner");
		limiter.reset("capture_photo");

		// Exhaust cli (limit 10)
		for (let i = 0; i < 10; i++) limiter.check("cli");
		assert.throws(() => limiter.check("cli"), /rate limit exceeded/i);

		// Exhaust write (limit 30)
		for (let i = 0; i < 30; i++) limiter.check("write");
		assert.throws(() => limiter.check("write"), /rate limit exceeded/i);

		// Exhaust read (limit 60)
		for (let i = 0; i < 60; i++) limiter.check("read");
		assert.throws(() => limiter.check("read"), /rate limit exceeded/i);

		// Exhaust edit (limit 30)
		for (let i = 0; i < 30; i++) limiter.check("edit");
		assert.throws(() => limiter.check("edit"), /rate limit exceeded/i);

		// Exhaust memory (limit 20)
		for (let i = 0; i < 20; i++) limiter.check("memory");
		assert.throws(() => limiter.check("memory"), /rate limit exceeded/i);

		// Exhaust task_tracker (limit 30)
		for (let i = 0; i < 30; i++) limiter.check("task_tracker");
		assert.throws(() => limiter.check("task_tracker"), /rate limit exceeded/i);

		// Exhaust skill_learner (limit 10)
		for (let i = 0; i < 10; i++) limiter.check("skill_learner");
		assert.throws(() => limiter.check("skill_learner"), /rate limit exceeded/i);

		// Exhaust capture_photo (limit 10)
		for (let i = 0; i < 10; i++) limiter.check("capture_photo");
		assert.throws(() => limiter.check("capture_photo"), /rate limit exceeded/i);
	});
});

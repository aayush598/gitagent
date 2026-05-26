import { describe, it } from "node:test";
import assert from "node:assert/strict";

interface HookResult {
	action: "allow" | "block" | "modify";
	reason?: string;
	args?: Record<string, any>;
}

interface HookDefinition {
	script: string;
	description?: string;
}

// Standalone version of the fixed runHooks
async function runHooksFixed(
	hooks: HookDefinition[] | undefined,
	executeHook: (hook: HookDefinition) => Promise<HookResult>,
): Promise<HookResult> {
	if (!hooks || hooks.length === 0) {
		return { action: "allow" };
	}
	for (const hook of hooks) {
		try {
			const result = await executeHook(hook);
			if (result.action === "block" || result.action === "modify") {
				return result;
			}
		} catch (err: any) {
			console.error(`Hook error: ${err.message}`);
			return { action: "block", reason: `Hook "${hook.script}" failed: ${err.message}` };
		}
	}
	return { action: "allow" };
}

// Standalone version of the buggy runHooks (for comparison)
async function runHooksBuggy(
	hooks: HookDefinition[] | undefined,
	executeHook: (hook: HookDefinition) => Promise<HookResult>,
): Promise<HookResult> {
	if (!hooks || hooks.length === 0) {
		return { action: "allow" };
	}
	for (const hook of hooks) {
		try {
			const result = await executeHook(hook);
			if (result.action === "block" || result.action === "modify") {
				return result;
			}
		} catch (err: any) {
			console.error(`Hook error: ${err.message}`);
		}
	}
	return { action: "allow" };
}

describe("BUG-004: Hook block silent failure", () => {
	it("fixed: returns block when hook throws", async () => {
		const result = await runHooksFixed(
			[{ script: "fail.sh" }],
			async () => { throw new Error("Hook crashed"); },
		);
		assert.equal(result.action, "block");
		assert.ok(result.reason?.includes("fail.sh"));
	});

	it("fixed: returns allow when hook allows", async () => {
		const result = await runHooksFixed(
			[{ script: "pass.sh" }],
			async () => ({ action: "allow" as const }),
		);
		assert.equal(result.action, "allow");
	});

	it("fixed: returns block when hook blocks", async () => {
		const result = await runHooksFixed(
			[{ script: "block.sh" }],
			async () => ({ action: "block" as const, reason: "Blocked by security" }),
		);
		assert.equal(result.action, "block");
		assert.equal(result.reason, "Blocked by security");
	});

	it("fixed: first block result wins (short-circuits)", async () => {
		let secondCalled = false;
		const result = await runHooksFixed(
			[{ script: "first.sh" }, { script: "second.sh" }],
			async (hook) => {
				if (hook.script === "first.sh") return { action: "block" as const, reason: "First blocks" };
				secondCalled = true;
				return { action: "allow" as const };
			},
		);
		assert.equal(result.action, "block");
		assert.equal(secondCalled, false);
	});

	it("fixed: empty hooks returns allow", async () => {
		const result = await runHooksFixed(undefined, async () => ({ action: "allow" as const }));
		assert.equal(result.action, "allow");
	});

	it("fixed: first hook error blocks even if later hooks would pass", async () => {
		let secondCalled = false;
		const result = await runHooksFixed(
			[{ script: "fail.sh" }, { script: "pass.sh" }],
			async (hook) => {
				if (hook.script === "fail.sh") throw new Error("Crash");
				secondCalled = true;
				return { action: "allow" as const };
			},
		);
		assert.equal(result.action, "block");
		assert.equal(secondCalled, false, "Second hook should not be reached");
	});

	it("buggy: silently allows when hook throws (demonstrates original bug)", async () => {
		const result = await runHooksBuggy(
			[{ script: "fail.sh" }],
			async () => { throw new Error("Hook crashed silently"); },
		);
		assert.equal(result.action, "allow", "Bug: hook error was silently swallowed");
	});
});

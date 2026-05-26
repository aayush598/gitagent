import { describe, it } from "node:test";
import assert from "node:assert/strict";

function validateSchedule(schedule: { id: string; mode: string; runAt?: string; cron?: string }): { valid: boolean; error?: string } {
	if (schedule.mode === "once" && schedule.runAt) {
		const ms = new Date(schedule.runAt).getTime();
		if (isNaN(ms)) {
			return { valid: false, error: `Invalid runAt for "${schedule.id}": ${schedule.runAt}` };
		}
		if (ms - Date.now() <= 0) {
			return { valid: false, error: `runAt for "${schedule.id}" is in the past` };
		}
	}
	if (schedule.cron !== undefined && schedule.cron !== null) {
		const trimmed = schedule.cron.trim();
		if (!trimmed) {
			return { valid: false, error: `Empty cron expression for "${schedule.id}"` };
		}
		const fields = trimmed.split(/\s+/);
		if (fields.length < 5 || fields.length > 6) {
			return { valid: false, error: `Invalid cron expression for "${schedule.id}": ${schedule.cron}` };
		}
	}
	return { valid: true };
}

describe("BUG-006: Cron schedules not validated", () => {
	it("rejects invalid runAt date", () => {
		const result = validateSchedule({ id: "s1", mode: "once", runAt: "not-a-date" });
		assert.equal(result.valid, false);
		assert.ok(result.error?.includes("Invalid runAt"));
	});

	it("accepts valid future runAt date", () => {
		const future = new Date(Date.now() + 86400000).toISOString();
		const result = validateSchedule({ id: "s1", mode: "once", runAt: future });
		assert.equal(result.valid, true);
	});

	it("rejects past runAt date", () => {
		const past = new Date(Date.now() - 86400000).toISOString();
		const result = validateSchedule({ id: "s1", mode: "once", runAt: past });
		assert.equal(result.valid, false);
		assert.ok(result.error?.includes("past"));
	});

	it("rejects invalid cron expression (too few fields)", () => {
		const result = validateSchedule({ id: "s1", mode: "repeating", cron: "* * *" });
		assert.equal(result.valid, false);
	});

	it("rejects invalid cron expression (too many fields)", () => {
		const result = validateSchedule({ id: "s1", mode: "repeating", cron: "* * * * * * *" });
		assert.equal(result.valid, false);
	});

	it("accepts valid cron expression", () => {
		const result = validateSchedule({ id: "s1", mode: "repeating", cron: "0 9 * * 1-5" });
		assert.equal(result.valid, true);
	});

	it("accepts schedule without cron or runAt (no validation needed)", () => {
		const result = validateSchedule({ id: "s1", mode: "once" });
		assert.equal(result.valid, true);
	});

	it("rejects empty cron string", () => {
		const result = validateSchedule({ id: "s1", mode: "repeating", cron: "" });
		assert.equal(result.valid, false);
	});
});

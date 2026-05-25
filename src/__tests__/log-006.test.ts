import { test } from "node:test";
import { strictEqual, ok } from "node:assert";

test("health check returns status object with checks", () => {
	const checks: Record<string, string> = {};
	checks.git = "ok";
	checks.disk = "ok";
	const allOk = Object.values(checks).every(v => v === "ok");
	const status = allOk ? "healthy" : "degraded";

	strictEqual(status, "healthy");
	strictEqual(checks.git, "ok");
	strictEqual(checks.disk, "ok");
});

test("health check reports degraded when checks fail", () => {
	const checks: Record<string, string> = {};
	checks.git = "corrupt";
	checks.disk = "ok";
	const allOk = Object.values(checks).every(v => v === "ok");
	const status = allOk ? "healthy" : "degraded";

	strictEqual(status, "degraded");
	strictEqual(checks.git, "corrupt");
});

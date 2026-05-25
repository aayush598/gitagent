import { test } from "node:test";
import { strictEqual } from "node:assert";

const VALID_ENVS = new Set(["development", "staging", "production", "test"]);

function validateEnv(name: string | undefined): boolean {
	if (!name) return true;
	if (!VALID_ENVS.has(name)) {
		console.warn(`Unknown environment "${name}"`);
		return false;
	}
	return true;
}

test("valid environment names are accepted", () => {
	strictEqual(validateEnv("development"), true);
	strictEqual(validateEnv("staging"), true);
	strictEqual(validateEnv("production"), true);
	strictEqual(validateEnv("test"), true);
});

test("invalid environment name is rejected", () => {
	strictEqual(validateEnv("invalid-env"), false);
});

test("undefined environment is accepted (no env set)", () => {
	strictEqual(validateEnv(undefined), true);
});

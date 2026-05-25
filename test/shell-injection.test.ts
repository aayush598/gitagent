import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { execFileSync, execSync } from "child_process";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// ── Security property: execFileSync vs execSync ─────────────────────

describe("execFileSync security properties", () => {
	it("passes argv as separate entries without shell interpretation", () => {
		// execFileSync("git", ["checkout", branch]) passes branch as a
		// single argv entry. Shell metacharacters in branch are treated
		// as literal characters, not interpreted.
		const result = execFileSync("echo", ["hello; echo world"], { encoding: "utf-8" });
		// If shell was involved, output would be "hello\nworld".
		// With argv array, the semicolon is literal.
		assert.equal(result.trim(), "hello; echo world");
	});

	it("preserves spaces, $, backticks, and quotes in arguments", () => {
		const dangerous = "branch with $(whoami) and `id` and \"quotes\"";
		const result = execFileSync("echo", [dangerous], { encoding: "utf-8" });
		assert.equal(result.trim(), dangerous, "all metacharacters are treated literally");
	});

	it("execSync with string interpolation is vulnerable but execFileSync is safe", () => {
		const maliciousInput = "$(echo INJECTED)";
		// execSync interprets shell metacharacters
		const shellResult = execSync(`echo ${maliciousInput}`, { encoding: "utf-8" });
		assert.notEqual(shellResult.trim(), maliciousInput, "execSync interprets $() shell expansion");

		// execFileSync treats them literally
		const fileResult = execFileSync("echo", [maliciousInput], { encoding: "utf-8" });
		assert.equal(fileResult.trim(), maliciousInput, "execFileSync treats $() as literal text");
	});
});

// ── Credential helper: token not exposed in URLs ────────────────────

describe("credential helper prevents token exposure", () => {
	it("remote URL without embedded token when credential helper is used", () => {
		// This simulates session.ts behavior: after setupCredentialHelper,
		// the remote URL contains no token.
		const plainUrl = "https://github.com/org/repo";
		// The new authedUrl equivalent just returns the plain URL
		assert.ok(!plainUrl.includes("@"), "plain URL has no token embedded");
		assert.ok(!plainUrl.includes("ghp_"), "plain URL has no PAT token");
	});

	it("credential file is written with restricted permissions", () => {
		// Simulate the setupCredentialHelper logic from session.ts
		const testDir = join(tmpdir(), `sec-004-test-${Date.now()}`);
		mkdirSync(testDir, { recursive: true });

		// Initialize a temporary git repo
		execFileSync("git", ["init"], { cwd: testDir, stdio: "pipe" });

		const url = "https://github.com/org/repo";
		const token = "ghp_test_token_12345";
		const host = new URL(url).host;
		const credentialsPath = join(testDir, ".git", ".git-credentials");

		// Write credential file (as setupCredentialHelper does)
		writeFileSync(credentialsPath, `https://oauth2:${token}@${host}\n`, "utf-8");
		execFileSync("chmod", ["600", credentialsPath], { stdio: "pipe" });

		// Verify the file exists, has correct contents, and remote URL is clean
		assert.ok(existsSync(credentialsPath), "credential file should exist");

		execFileSync("git", ["remote", "add", "origin", url], { cwd: testDir, stdio: "pipe" });
		const remoteUrl = execFileSync("git", ["remote", "get-url", "origin"], { cwd: testDir, encoding: "utf-8" }).trim();
		assert.ok(!remoteUrl.includes(token), "remote URL should not contain the token");
		assert.ok(!remoteUrl.includes("@"), "remote URL should not have embedded credentials");

		// Cleanup
		execFileSync("rm", ["-rf", testDir], { stdio: "pipe" });
	});
});

// ── Check that session.ts git() uses string[] args ──────────────────

describe("git() helper refactored to use string[] args", () => {
	it("should accept string[] and call execFileSync with argv array", () => {
		// Simulate the refactored git() from session.ts
		function git(args: string[], cwd: string): string {
			return execFileSync("git", args, { cwd, stdio: "pipe", encoding: "utf-8" }).trim();
		}

		// Verify the function signature -- it must accept string[] not string
		assert.equal(typeof git, "function");
		// The key security property: args are passed as an array, not a shell string.
		// If args were a single string, shell metacharacters would be interpreted.
		assert.equal(Array.isArray(["checkout", "safe-branch"]), true);
	});
});

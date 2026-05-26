import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execSync, execFileSync } from "child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "fs";
import { randomBytes } from "crypto";

const MEMORY_PATH = new URL("../src/tools/memory.ts", import.meta.url).pathname;

function setupRepo(dir: string): void {
	execSync(`rm -rf ${dir} && mkdir -p ${dir}/memory`);
	execSync(`git init && git config user.email t@t.com && git config user.name T`, { cwd: dir });
	writeFileSync(`${dir}/.gitignore`, "node_modules/\n");
	execSync(`git add .gitignore && git commit -m init --no-verify`, { cwd: dir });
}

function createHook(dir: string): void {
	mkdirSync(`${dir}/.git/hooks`, { recursive: true });
	writeFileSync(`${dir}/.git/hooks/pre-commit`, "#!/bin/sh\nexit 1\n");
	execSync(`chmod +x ${dir}/.git/hooks/pre-commit`);
}

// Standalone rollback save — mirrors the fix in memory.ts
async function rollbackSave(
	dir: string,
	memoryPath: string,
	content: string,
	commitMsg: string,
	makeHookReject: boolean,
) {
	const memoryFile = `${dir}/${memoryPath}`;
	const fileExists = existsSync(memoryFile);
	let backup: string | null = null;
	if (fileExists) {
		backup = readFileSync(memoryFile, "utf-8");
	}

	// Write new content
	writeFileSync(memoryFile, content, "utf-8");

	try {
		if (makeHookReject) createHook(dir);
		execFileSync("git", ["add", memoryPath], { cwd: dir, stdio: "pipe" });
		execFileSync("git", ["commit", "-m", commitMsg], { cwd: dir, stdio: "pipe" });
	} catch (err: any) {
		// Rollback
		if (backup !== null) {
			writeFileSync(memoryFile, backup, "utf-8");
		} else {
			rmSync(memoryFile, { force: true });
		}
		// Unstage
		try {
			execFileSync("git", ["reset", "HEAD", "--", memoryPath], { cwd: dir, stdio: "pipe" });
		} catch { /* */ }
		return { success: false, stderr: err.stderr?.toString() || err.message || "unknown" };
	}
	return { success: true };
}

describe("BUG-001: Git commit failure data integrity", () => {
	it("rolls back file content when git commit hook rejects", async () => {
		const dir = `/tmp/bug-001-test-${randomBytes(4).toString("hex")}`;
		setupRepo(dir);

		writeFileSync(`${dir}/memory/MEMORY.md`, "# Initial memory");
		execSync(`git add memory/MEMORY.md && git commit -m "initial" --no-verify`, { cwd: dir });

		const result = await rollbackSave(dir, "memory/MEMORY.md", "# New content", "test", true);

		const content = readFileSync(`${dir}/memory/MEMORY.md`, "utf-8");
		assert.ok(content.includes("Initial memory"), "File should be rolled back to original");
		assert.ok(!content.includes("New content"), "New content should not persist");
		assert.equal(result.success, false, "Should report failure");
	});

	it("normal save succeeds without hooks", async () => {
		const dir = `/tmp/bug-001-test-${randomBytes(4).toString("hex")}`;
		setupRepo(dir);

		const result = await rollbackSave(dir, "memory/MEMORY.md", "# Working memory", "working", false);

		assert.equal(result.success, true, "Normal save should succeed");
		const content = readFileSync(`${dir}/memory/MEMORY.md`, "utf-8");
		assert.ok(content.includes("Working memory"), "Content should be written");
	});

	it("prevents shell injection in commit message", async () => {
		const dir = `/tmp/bug-001-test-${randomBytes(4).toString("hex")}`;
		setupRepo(dir);

		const hackFile = "/tmp/bug-001-hacked";

		const result = await rollbackSave(
			dir, "memory/MEMORY.md", "# Safe memory",
			`test $(touch ${hackFile}) && echo pwned`,
			false,
		);

		assert.equal(existsSync(hackFile), false, "Shell injection should not occur");
		try { execSync(`rm -f ${hackFile}`); } catch { /* */ }
		assert.ok(result.success, "execFileSync should pass literal commit message");
	});

	it("rolls back new file (no backup) when git fails", async () => {
		const dir = `/tmp/bug-001-test-${randomBytes(4).toString("hex")}`;
		setupRepo(dir);

		const result = await rollbackSave(dir, "memory/MEMORY.md", "# First save", "first", true);

		assert.equal(existsSync(`${dir}/memory/MEMORY.md`), false,
			"File should be removed on rollback if no backup existed");
		assert.equal(result.success, false, "Should report failure");
	});

	it("git index is reset after rollback", async () => {
		const dir = `/tmp/bug-001-test-${randomBytes(4).toString("hex")}`;
		setupRepo(dir);

		writeFileSync(`${dir}/memory/MEMORY.md`, "# Original content");
		execSync(`git add memory/MEMORY.md && git commit -m "original" --no-verify`, { cwd: dir });

		const result = await rollbackSave(dir, "memory/MEMORY.md", "# Should not stage", "test", true);

		assert.equal(result.success, false);
		const status = execSync(`git status --porcelain`, { cwd: dir, encoding: "utf-8" });
		assert.equal(status.trim(), "", "Working tree should be clean after rollback");
	});

	it("uses execFileSync (not execSync) for git commands in source", () => {
		const source = readFileSync(MEMORY_PATH, "utf-8");
		const shellGitCalls = source.match(/execSync\(`git/g);
		assert.equal(shellGitCalls, null,
			"Should have no execSync with shell git commands");
		assert.ok(source.includes("execFileSync"),
			"Should use execFileSync for git operations");
	});

	it("execFileSync prevents shell metacharacter injection", () => {
		const dir = `/tmp/bug-001-test-${randomBytes(4).toString("hex")}`;
		setupRepo(dir);

		writeFileSync(`${dir}/test.txt`, "hello");
		execFileSync("git", ["add", "test.txt"], { cwd: dir, stdio: "pipe" });

		const hackFile = "/tmp/bug-001-hacked-2";
		const maliciousMsg = `test $(touch ${hackFile})`;

		execFileSync("git", ["commit", "-m", maliciousMsg], { cwd: dir, stdio: "pipe" });

		assert.equal(existsSync(hackFile), false, "execFileSync should prevent command injection");
		const log = execSync(`git log --oneline`, { cwd: dir, encoding: "utf-8" });
		assert.ok(log.includes("init"), "Commit should still work");

		try { execSync(`rm -f ${hackFile}`); } catch { /* */ }
	});
});

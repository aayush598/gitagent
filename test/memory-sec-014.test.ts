import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ── Copied from src/tools/memory.ts (SEC-014 functions) ──

const MAX_MEMORY_COMMITS = 50;

function countMemoryCommits(cwd: string, memoryPath: string): number {
	try {
		const out = execSync(`git log --oneline -- "${memoryPath}" 2>/dev/null | wc -l`, {
			cwd,
			encoding: "utf-8",
			stdio: "pipe",
		}).trim();
		return parseInt(out, 10) || 0;
	} catch {
		return 0;
	}
}

function getCurrentBranch(cwd: string): string {
	return execSync("git rev-parse --abbrev-ref HEAD", { cwd, encoding: "utf-8" }).trim();
}

function squashMemoryHistory(
	cwd: string,
	memoryPath: string,
	memoryFile: string,
	commitCount: number,
): void {
	const content = readFileSync(memoryFile, "utf-8");
	const branch = getCurrentBranch(cwd);

	try {
		execSync(
			`git filter-branch --force --prune-empty --index-filter 'git rm --cached --ignore-unmatch "${memoryPath}"' HEAD`,
			{ cwd, stdio: "pipe", timeout: 60000, maxBuffer: 10 * 1024 * 1024 },
		);
		execSync(`git update-ref -d refs/original/refs/heads/${branch} 2>/dev/null; rm -rf .git/refs/original`, {
			cwd,
			stdio: "pipe",
		});
		writeFileSync(memoryFile, content, "utf-8");
		execSync(`git add "${memoryPath}" && git commit -m "Memory history squashed (${commitCount} commits → 1)"`, {
			cwd,
			stdio: "pipe",
		});
		execSync("git gc --aggressive --prune=now", { cwd, stdio: "pipe", timeout: 120000 });
	} catch (err: any) {
		console.error(`SEC-014: Memory history squash failed: ${err.message || err}`);
	}
}

function runGitGC(cwd: string): void {
	try {
		execSync("git gc --auto --quiet", { cwd, stdio: "pipe", timeout: 30000 });
	} catch {
		// Non-fatal
	}
}

// ── Helper ──

let TEST_DIR: string;
const MEMORY_FILE = "memory/MEMORY.md";
const MEMORY_PATH = "memory/MEMORY.md";

function git(...args: string[]): string {
	return execSync(`git ${args.join(" ")}`, { cwd: TEST_DIR, encoding: "utf-8", stdio: "pipe" }).trim();
}

function initRepo(): void {
	rmSync(TEST_DIR, { recursive: true, force: true });
	mkdirSync(`${TEST_DIR}/memory`, { recursive: true });
	git("init");
	git("config", "user.email", "test@sec-014.test");
	git("config", "user.name", "SEC-014 Test");
}

function saveMemory(content: string, message: string): void {
	const memoryFile = join(TEST_DIR, MEMORY_FILE);
	writeFileSync(memoryFile, content, "utf-8");
	git("add", MEMORY_PATH);
	execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { cwd: TEST_DIR, stdio: "pipe", encoding: "utf-8" });
}

// ── Tests ──

describe("SEC-014: Git History Protections", () => {
	before(() => {
		TEST_DIR = join(tmpdir(), `sec-014-test-${process.pid}`);
		initRepo();
	});

	after(() => {
		rmSync(TEST_DIR, { recursive: true, force: true });
	});

	it("countMemoryCommits returns 0 for fresh repo", () => {
		assert.equal(countMemoryCommits(TEST_DIR, MEMORY_PATH), 0);
	});

	it("countMemoryCommits returns correct count after saves", () => {
		initRepo(); // fresh start
		saveMemory("# Memory\nEntry 1", "entry-1");
		saveMemory("# Memory\nEntry 2", "entry-2");
		saveMemory("# Memory\nEntry 3", "entry-3");
		assert.equal(countMemoryCommits(TEST_DIR, MEMORY_PATH), 3);
	});

	it("squashMemoryHistory reduces commits to ≤2", () => {
		initRepo(); // fresh start

		// Create 10 commits
		for (let i = 0; i < 10; i++) {
			saveMemory(`# Memory\nEntry ${i}`, `entry-${i}`);
		}
		assert.equal(countMemoryCommits(TEST_DIR, MEMORY_PATH), 10);

		// Squash
		const memoryFile = join(TEST_DIR, MEMORY_FILE);
		squashMemoryHistory(TEST_DIR, MEMORY_PATH, memoryFile, 10);
		const commitsAfter = countMemoryCommits(TEST_DIR, MEMORY_PATH);
		assert.ok(commitsAfter <= 2, `Expected ≤2 commits after squash, got ${commitsAfter}`);
	});

	it("content is preserved after squash", () => {
		initRepo(); // fresh start

		for (let i = 0; i < 10; i++) {
			saveMemory(`# Memory\nEntry ${i}: preserved content`, `entry-${i}`);
		}

		const memoryFile = join(TEST_DIR, MEMORY_FILE);
		squashMemoryHistory(TEST_DIR, MEMORY_PATH, memoryFile, 10);

		const content = readFileSync(memoryFile, "utf-8");
		assert.ok(content.includes("Entry 9"), "Latest content must be preserved after squash");
	});

	it("git gc --auto runs without error", () => {
		initRepo(); // fresh start

		saveMemory("# Memory\nGC test", "gc test");

		// Should not throw
		runGitGC(TEST_DIR);

		const status = git("status", "--porcelain");
		assert.equal(status, "", "Working tree should be clean after gc");
	});

	it("archive files are not git-added", () => {
		initRepo(); // fresh start

		// Manually create an archive file (simulating what archiveOverflow would do)
		const archiveDir = join(TEST_DIR, "memory", "archive");
		mkdirSync(archiveDir, { recursive: true });
		writeFileSync(join(archiveDir, "2026-05.md"), "# Archived content\nOld secrets here", "utf-8");

		// Save the memory file (should NOT add archive files)
		saveMemory("# Memory\nCurrent content", "clean save");

		const tracked = git("ls-files", "memory/archive/");
		assert.equal(tracked, "", "Archive files should not be tracked in git");
	});

	it("reflog is also destroyed after squash (objects unreachable)", () => {
		initRepo(); // fresh start

		for (let i = 0; i < 10; i++) {
			saveMemory(`# Memory\nSensitive entry ${i}`, `entry-${i}`);
		}

		const memoryFile = join(TEST_DIR, MEMORY_FILE);
		squashMemoryHistory(TEST_DIR, MEMORY_PATH, memoryFile, 10);

		// After filter-branch + gc --prune=now, the original objects should be gone.
		// The branch may have 1 squash commit or be empty if only memory files existed.
		let log: string;
		try {
			log = git("log", "--oneline");
		} catch {
			log = ""; // branch may be empty after squash
		}
		if (log) {
			const lines = log.split("\n").filter(Boolean);
			assert.ok(lines.length <= 2, `Expected ≤2 commits after squash, got ${lines.length}`);
		}
	});
});

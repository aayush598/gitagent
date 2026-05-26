import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync, rmSync, mkdirSync } from "fs";
import { execSync, execFileSync } from "child_process";
import { join } from "path";

const TEST_DIR = "/tmp/bug-010-test";

function setupRepo(dir: string): void {
	rmSync(dir, { recursive: true, force: true });
	mkdirSync(`${dir}/memory/photos`, { recursive: true });
	execSync(`cd ${dir} && git init && git config user.email t@t.com && git config user.name T`);
	writeFileSync(`${dir}/init`, "");
	execSync(`cd ${dir} && git add init && git commit -m init --no-verify`);
	const fakeFrame = Buffer.alloc(1024, 0xFF);
	writeFileSync(`${dir}/memory/.latest-frame.jpg`, fakeFrame);
}

async function capturePhotoWithRollback(
	dir: string,
	reason: string,
): Promise<{ success: boolean; text: string }> {
	const frameData = readFileSync(join(dir, "memory/.latest-frame.jpg"));

	const now = new Date();
	const pad = (n: number) => String(n).padStart(2, "0");
	const datePart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
	const timePart = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
	const slug = reason.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
	const filename = `${datePart}_${timePart}_${slug}.jpg`;
	const photoRelPath = `memory/photos/${filename}`;
	const photoAbsPath = join(dir, photoRelPath);
	const indexPath = join(dir, "memory/photos/INDEX.md");

	mkdirSync(join(dir, "memory/photos"), { recursive: true });

	// Write photo
	writeFileSync(photoAbsPath, frameData);

	// Backup original INDEX.md
	let originalIndex: string | null = null;
	try {
		originalIndex = readFileSync(indexPath, "utf-8");
	} catch {
		// New file
	}

	// Update INDEX.md
	let indexContent = originalIndex ?? "# Memorable Moments\n\nPhotos captured during happy and memorable moments.\n\n";
	const entry = `- **${datePart} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}** — ${reason} → [\`${filename}\`](${filename})\n`;
	indexContent += entry;
	writeFileSync(indexPath, indexContent, "utf-8");

	// Git ops with rollback
	try {
		execFileSync("git", ["add", photoRelPath, "memory/photos/INDEX.md"], { cwd: dir, stdio: "pipe" });
		execFileSync("git", ["commit", "-m", `Capture moment: ${reason}`], { cwd: dir, stdio: "pipe" });
	} catch (err: any) {
		try { rmSync(photoAbsPath, { force: true }); } catch { /* ignore */ }
		if (originalIndex !== null) {
			writeFileSync(indexPath, originalIndex, "utf-8");
		} else {
			try { rmSync(indexPath, { force: true }); } catch { /* ignore */ }
		}
		try {
			execFileSync("git", ["reset", "HEAD", "--", photoRelPath, "memory/photos/INDEX.md"], { cwd: dir, stdio: "pipe" });
		} catch { /* ignore */ }

		const stderr = err.stderr?.toString() || err.message || "unknown error";
		return { success: false, text: `Photo capture failed: ${stderr}. Previous state restored.` };
	}

	return { success: true, text: `Memorable moment captured! Photo saved to ${photoRelPath} and committed.` };
}

describe("BUG-010: capture_photo Rollback Cleanup", () => {
	before(() => {
		rmSync(TEST_DIR, { recursive: true, force: true });
	});

	after(() => {
		rmSync(TEST_DIR, { recursive: true, force: true });
	});

	it("should clean up photo file on git failure with pre-commit hook", async () => {
		const dir = join(TEST_DIR, "hook-reject");
		setupRepo(dir);

		mkdirSync(`${dir}/.git/hooks`, { recursive: true });
		writeFileSync(`${dir}/.git/hooks/pre-commit`, "#!/bin/sh\nexit 1\n");
		execSync(`chmod +x ${dir}/.git/hooks/pre-commit`);

		const result = await capturePhotoWithRollback(dir, "test capture");
		assert.equal(result.success, false, "Should fail on hook rejection");
		assert.ok(result.text.includes("Previous state restored"), "Should mention rollback");

		const files = execSync(`ls ${dir}/memory/photos/`, { encoding: "utf-8" }).trim().split("\n").filter(Boolean);
		const jpgFiles = files.filter(f => f.endsWith(".jpg"));
		assert.equal(jpgFiles.length, 0, `Photo file should be cleaned up, found: ${jpgFiles.join(", ")}`);
	});

	it("should restore INDEX.md on git failure", async () => {
		const dir = join(TEST_DIR, "index-restore");
		setupRepo(dir);

		const indexPath = join(dir, "memory/photos/INDEX.md");
		writeFileSync(indexPath, "# Existing content\n\n", "utf-8");
		execSync(`cd ${dir} && git add memory/photos/INDEX.md && git commit -m "add index" --no-verify`);

		mkdirSync(`${dir}/.git/hooks`, { recursive: true });
		writeFileSync(`${dir}/.git/hooks/pre-commit`, "#!/bin/sh\nexit 1\n");
		execSync(`chmod +x ${dir}/.git/hooks/pre-commit`);

		const originalContent = readFileSync(indexPath, "utf-8");
		const result = await capturePhotoWithRollback(dir, "should rollback");
		assert.equal(result.success, false);

		const restoredContent = readFileSync(indexPath, "utf-8");
		assert.equal(restoredContent, originalContent, "INDEX.md should be restored to original content");
	});

	it("should succeed when git operations work normally", async () => {
		const dir = join(TEST_DIR, "normal");
		setupRepo(dir);

		const result = await capturePhotoWithRollback(dir, "happy moment");
		assert.equal(result.success, true, "Normal capture should succeed");
		assert.ok(result.text.includes("captured"), "Should mention captured");

		const log = execSync(`cd ${dir} && git log --oneline -2`, { encoding: "utf-8" });
		assert.ok(log.includes("Capture moment"), "Should have a commit with the capture message");
	});

	it("should not leave staged photo or index files after rollback", async () => {
		const dir = join(TEST_DIR, "no-staged");
		setupRepo(dir);

		mkdirSync(`${dir}/.git/hooks`, { recursive: true });
		writeFileSync(`${dir}/.git/hooks/pre-commit`, "#!/bin/sh\nexit 1\n");
		execSync(`chmod +x ${dir}/.git/hooks/pre-commit`);

		await capturePhotoWithRollback(dir, "rollback test");

		const stagedStatus = execSync(`cd ${dir} && git diff --cached --name-only`, { encoding: "utf-8" }).trim();
		assert.equal(stagedStatus, "", `Should have no staged files after rollback, got: "${stagedStatus}"`);
	});

	it("should use execFileSync to prevent shell injection in reason", async () => {
		const dir = join(TEST_DIR, "injection");
		setupRepo(dir);

		const injectionMarker = "/tmp/bug-010-injected";
		rmSync(injectionMarker, { force: true });

		await capturePhotoWithRollback(dir, "test $(touch " + injectionMarker + ")");

		assert.equal(existsSync(injectionMarker), false, "Shell injection should not succeed");
	});
});

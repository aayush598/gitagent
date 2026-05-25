import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync, symlinkSync, rmSync, realpathSync, lstatSync } from "fs";
import { join, resolve, relative } from "path";
import { tmpdir, homedir } from "os";

// Standalone copies for testing (actual implementations in src/tools/shared.ts)

function resolveSafePath(path: string, cwd: string): string {
	if (!path || !path.trim()) throw new Error("Path cannot be empty");
	if (path.includes("\0")) throw new Error("Path contains null byte");
	if (path.startsWith("~/") || path === "~") path = homedir() + path.slice(1);
	const resolved = path.startsWith("/") ? path : resolve(cwd, path);
	if (path.startsWith("/") || relative(resolve(cwd), resolved).startsWith("..")) {
		throw new Error("Path traversal detected");
	}
	let allowedBase = resolve(cwd);
	try { allowedBase = realpathSync(allowedBase); } catch {}
	let realResolved: string;
	try {
		realResolved = realpathSync(resolved);
	} catch {
		const relPath = relative(allowedBase, resolved);
		const parts = relPath.split("/").filter(Boolean);
		let candidate = allowedBase;
		for (const part of parts) {
			candidate = resolve(candidate, part);
			try { candidate = realpathSync(candidate); } catch {}
		}
		realResolved = candidate;
	}
	if (relative(allowedBase, realResolved).startsWith("..")) {
		throw new Error("Path traversal detected (symlink resolved)");
	}
	return resolved;
}

function assertNotSymlink(path: string): void {
	try {
		const stats = lstatSync(path);
		if (stats.isSymbolicLink()) {
			throw new Error("Path is a symbolic link — blocked for security");
		}
	} catch (err: any) {
		if (err.message?.includes("symbolic link")) throw err;
	}
}

// ── resolveSafePath tests (from SEC-005) ────────────────────────────────

describe("resolveSafePath", () => {
	const cwd = "/tmp/workspace";

	it("rejects absolute paths", () => {
		assert.throws(() => resolveSafePath("/etc/passwd", cwd), /Path traversal detected/);
	});

	it("rejects home directory expansion", () => {
		assert.throws(() => resolveSafePath("~/.ssh/id_rsa", cwd), /Path traversal detected/);
	});

	it("rejects ../ traversal", () => {
		assert.throws(() => resolveSafePath("../../../etc/passwd", cwd), /Path traversal detected/);
	});

	it("allows relative paths within workspace", () => {
		assert.strictEqual(resolveSafePath("file.txt", cwd), "/tmp/workspace/file.txt");
	});

	it("allows paths in subdirectories", () => {
		assert.strictEqual(resolveSafePath("subdir/file.txt", cwd), "/tmp/workspace/subdir/file.txt");
	});

	it("rejects empty path", () => {
		assert.throws(() => resolveSafePath("", cwd), /Path cannot be empty/);
	});

	it("rejects null byte in path", () => {
		assert.throws(() => resolveSafePath("safe.txt\0../../../evil", cwd), /null byte/);
	});
});

// ── Symlink tests (SEC-006) ─────────────────────────────────────────────

describe("assertNotSymlink", () => {
	const testDir = join(tmpdir(), `sec-006-test-${Date.now()}`);

	it("throws when path is a symbolic link", () => {
		mkdirSync(testDir, { recursive: true });
		const target = join(testDir, "target.txt");
		const link = join(testDir, "my-link");
		writeFileSync(target, "content");
		symlinkSync("target.txt", link);

		assert.throws(() => assertNotSymlink(link), /symbolic link/);
		rmSync(testDir, { recursive: true, force: true });
	});

	it("does not throw for regular file", () => {
		mkdirSync(testDir, { recursive: true });
		const file = join(testDir, "regular.txt");
		writeFileSync(file, "content");
		assert.doesNotThrow(() => assertNotSymlink(file));
		rmSync(testDir, { recursive: true, force: true });
	});

	it("does not throw for non-existent path", () => {
		mkdirSync(testDir, { recursive: true });
		const missing = join(testDir, "does-not-exist.txt");
		assert.doesNotThrow(() => assertNotSymlink(missing));
		rmSync(testDir, { recursive: true, force: true });
	});

	it("does not throw for directory", () => {
		mkdirSync(testDir, { recursive: true });
		assert.doesNotThrow(() => assertNotSymlink(testDir));
		rmSync(testDir, { recursive: true, force: true });
	});

	it("throws when directory is a symbolic link", () => {
		mkdirSync(testDir, { recursive: true });
		const realDir = join(testDir, "real-dir");
		const linkDir = join(testDir, "link-dir");
		mkdirSync(realDir);
		symlinkSync("real-dir", linkDir);

		assert.throws(() => assertNotSymlink(linkDir), /symbolic link/);
		rmSync(testDir, { recursive: true, force: true });
	});
});

describe("resolveSafePath symlink protection", () => {
	const testDir = join(tmpdir(), `sec-006-symlink-${Date.now()}`);
	const workspaceDir = join(testDir, "workspace");
	const outsideTarget = join(testDir, "outside.txt");

	it("prevents symlink pointing outside workspace", () => {
		mkdirSync(workspaceDir, { recursive: true });
		writeFileSync(outsideTarget, "sensitive");
		const link = join(workspaceDir, "evil-link");
		symlinkSync(outsideTarget, link);
		assert.throws(() => resolveSafePath("evil-link", workspaceDir), /Path traversal detected/);
		rmSync(testDir, { recursive: true, force: true });
	});

	it("allows symlinks that stay within workspace", () => {
		mkdirSync(workspaceDir, { recursive: true });
		const realFile = join(workspaceDir, "real.txt");
		writeFileSync(realFile, "content");
		symlinkSync("real.txt", join(workspaceDir, "safe-link"));
		assert.doesNotThrow(() => resolveSafePath("safe-link", workspaceDir));
		rmSync(testDir, { recursive: true, force: true });
	});

	it("handles non-existent file paths", () => {
		mkdirSync(workspaceDir, { recursive: true });
		assert.doesNotThrow(() => resolveSafePath("new-file.txt", workspaceDir));
		rmSync(testDir, { recursive: true, force: true });
	});
});

describe("defense-in-depth: resolveSafePath + assertNotSymlink", () => {
	const testDir = join(tmpdir(), `sec-006-depth-${Date.now()}`);
	const workspaceDir = join(testDir, "workspace");

	it("both checks catch a symlink pointing outside the workspace", () => {
		mkdirSync(workspaceDir, { recursive: true });
		const outside = join(testDir, "outside.txt");
		writeFileSync(outside, "stolen data");
		const link = join(workspaceDir, "evil");
		symlinkSync(outside, link);

		// resolveSafePath catches it via realpathSync
		assert.throws(() => resolveSafePath("evil", workspaceDir), /Path traversal detected/);

		// assertNotSymlink also catches it
		assert.throws(() => assertNotSymlink(link), /symbolic link/);

		rmSync(testDir, { recursive: true, force: true });
	});

	it("both checks allow a regular file", () => {
		mkdirSync(workspaceDir, { recursive: true });
		const file = join(workspaceDir, "normal.txt");
		writeFileSync(file, "data");

		assert.doesNotThrow(() => resolveSafePath("normal.txt", workspaceDir));
		assert.doesNotThrow(() => assertNotSymlink(file));

		rmSync(testDir, { recursive: true, force: true });
	});

	it("resolveSafePath catches symlink in parent component while assertNotSymlink on dir also catches it", () => {
		mkdirSync(workspaceDir, { recursive: true });
		const outsideDir = join(testDir, "outside-dir");
		mkdirSync(outsideDir);
		const dirLink = join(workspaceDir, "dir-link");
		symlinkSync(outsideDir, dirLink);

		// Writing to dir-link/file should be caught by resolveSafePath
		assert.throws(() => resolveSafePath("dir-link/file.txt", workspaceDir), /Path traversal detected/);

		// assertNotSymlink also catches the symlinked directory
		assert.throws(() => assertNotSymlink(dirLink), /symbolic link/);

		rmSync(testDir, { recursive: true, force: true });
	});
});

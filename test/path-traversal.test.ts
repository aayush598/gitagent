import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync, symlinkSync, rmSync, existsSync, realpathSync, readFileSync, unlinkSync } from "fs";
import { join, resolve, relative } from "path";
import { tmpdir, homedir } from "os";

/**
 * Standalone copy of resolveSafePath for testing.
 * The actual implementation is in src/tools/shared.ts and is used by the tools at runtime.
 */
function resolveSafePath(path: string, cwd: string): string {
	if (!path || !path.trim()) {
		throw new Error("Path cannot be empty");
	}

	if (path.includes("\0")) {
		throw new Error("Path contains null byte — possible injection attempt");
	}

	if (path.startsWith("~/") || path === "~") {
		path = homedir() + path.slice(1);
	}

	const resolved = path.startsWith("/") ? path : resolve(cwd, path);

	if (path.startsWith("/") || relative(resolve(cwd), resolved).startsWith("..")) {
		throw new Error(
			`Path traversal detected: "${path}" resolves outside the working directory. ` +
			`Use paths relative to the workspace: ${cwd}`,
		);
	}

	let allowedBase = resolve(cwd);
	try {
		allowedBase = realpathSync(allowedBase);
	} catch {
	}

	let realResolved: string;
	try {
		realResolved = realpathSync(resolved);
	} catch {
		const relPath = relative(allowedBase, resolved);
		const parts = relPath.split("/").filter(Boolean);
		let candidate = allowedBase;
		for (const part of parts) {
			candidate = resolve(candidate, part);
			try {
				candidate = realpathSync(candidate);
			} catch {
			}
		}
		realResolved = candidate;
	}

	const realRel = relative(allowedBase, realResolved);
	if (realRel.startsWith("..")) {
		throw new Error(
			`Path traversal detected: "${path}" resolves to "${realResolved}" which is outside the working directory ` +
			`(symlink resolved). Use paths relative to the workspace: ${cwd}`,
		);
	}

	return resolved;
}

describe("resolveSafePath", () => {
	const cwd = "/tmp/workspace";

	it("rejects absolute paths", () => {
		assert.throws(() => resolveSafePath("/etc/passwd", cwd), /Path traversal detected/);
	});

	it("rejects home directory expansion", () => {
		assert.throws(() => resolveSafePath("~/.ssh/id_rsa", cwd), /Path traversal detected/);
	});

	it("rejects tilde alone", () => {
		assert.throws(() => resolveSafePath("~", cwd), /Path traversal detected/);
	});

	it("rejects ../ traversal", () => {
		assert.throws(() => resolveSafePath("../../../etc/passwd", cwd), /Path traversal detected/);
	});

	it("rejects deeply nested ../ traversal", () => {
		assert.throws(() => resolveSafePath("subdir/../../other", cwd), /Path traversal detected/);
	});

	it("allows relative paths within workspace", () => {
		const result = resolveSafePath("file.txt", cwd);
		assert.strictEqual(result, "/tmp/workspace/file.txt");
	});

	it("allows paths in subdirectories", () => {
		const result = resolveSafePath("subdir/file.txt", cwd);
		assert.strictEqual(result, "/tmp/workspace/subdir/file.txt");
	});

	it("allows deeply nested paths", () => {
		const result = resolveSafePath("a/b/c/d/file.txt", cwd);
		assert.strictEqual(result, "/tmp/workspace/a/b/c/d/file.txt");
	});

	it("normalizes .. that stays within workspace", () => {
		const result = resolveSafePath("a/b/../c/file.txt", cwd);
		assert.strictEqual(result, "/tmp/workspace/a/c/file.txt");
	});

	it("rejects absolute path with trailing slash", () => {
		assert.throws(() => resolveSafePath("/etc/", cwd), /Path traversal detected/);
	});

	it("rejects empty path", () => {
		assert.throws(() => resolveSafePath("", cwd), /Path cannot be empty/);
	});

	it("rejects whitespace-only path", () => {
		assert.throws(() => resolveSafePath("   ", cwd), /Path cannot be empty/);
	});

	it("rejects null byte in path", () => {
		assert.throws(() => resolveSafePath("safe.txt\0../../../evil", cwd), /null byte/);
	});
});

describe("resolveSafePath symlink protection", () => {
	const testDir = join(tmpdir(), `sec-005-symlink-${Date.now()}`);
	const workspaceDir = join(testDir, "workspace");
	const outsideTarget = join(testDir, "outside.txt");

	it("prevents reading files outside workspace through symlinks", () => {
		mkdirSync(workspaceDir, { recursive: true });
		writeFileSync(outsideTarget, "sensitive data");

		const symlinkPath = join(workspaceDir, "evil-link");
		symlinkSync(outsideTarget, symlinkPath);

		assert.throws(
			() => resolveSafePath("evil-link", workspaceDir),
			/Path traversal detected/,
		);

		rmSync(testDir, { recursive: true, force: true });
	});

	it("prevents nested symlink traversal", () => {
		mkdirSync(workspaceDir, { recursive: true });
		writeFileSync(outsideTarget, "sensitive data");

		const subdir = join(workspaceDir, "subdir");
		mkdirSync(subdir, { recursive: true });

		const linkChain = join(workspaceDir, "link-to-outside");
		symlinkSync(outsideTarget, linkChain);

		assert.throws(
			() => resolveSafePath("subdir/../link-to-outside", workspaceDir),
			/Path traversal detected/,
		);

		rmSync(testDir, { recursive: true, force: true });
	});

	it("allows symlinks that stay within the workspace", () => {
		mkdirSync(workspaceDir, { recursive: true });
		const realFile = join(workspaceDir, "real-file.txt");
		writeFileSync(realFile, "content");
		const safeLink = join(workspaceDir, "safe-link");
		symlinkSync("real-file.txt", safeLink);

		const result = resolveSafePath("safe-link", workspaceDir);
		assert.strictEqual(result, safeLink);

		rmSync(testDir, { recursive: true, force: true });
	});

	it("handles non-existent paths gracefully (e.g. new file to write)", () => {
		mkdirSync(workspaceDir, { recursive: true });
		const result = resolveSafePath("new-file.txt", workspaceDir);
		assert.strictEqual(result, join(workspaceDir, "new-file.txt"));
		rmSync(testDir, { recursive: true, force: true });
	});

	it("handles non-existent parent dir for new deep file", () => {
		mkdirSync(workspaceDir, { recursive: true });
		const result = resolveSafePath("new-dir/subdir/file.txt", workspaceDir);
		assert.strictEqual(result, join(workspaceDir, "new-dir/subdir/file.txt"));
		rmSync(testDir, { recursive: true, force: true });
	});

	it("prevents traversal when cwd is a symlink pointing outside", () => {
		// Create a symlink as the "cwd" that points outside workspace
		const realDir = join(testDir, "real-dir");
		mkdirSync(realDir, { recursive: true });
		const fakeCwd = join(testDir, "fake-cwd");
		symlinkSync(realDir, fakeCwd);

		// A path like "../outside" from fakeCwd should be caught
		// because realpathSync resolves fakeCwd to realDir, and ../ from realDir is testDir
		assert.throws(
			() => resolveSafePath("../outside.txt", fakeCwd),
			/Path traversal detected/,
		);

		rmSync(testDir, { recursive: true, force: true });
	});
});

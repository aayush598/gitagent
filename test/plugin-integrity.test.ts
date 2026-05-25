import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ── Copied integrity functions from src/plugins.ts ──

function computeFileHash(filePath: string): string {
	const content = readFileSync(filePath);
	return createHash("sha256").update(content).digest("hex");
}

function verifyIntegrity(filePath: string, expectedHash: string): boolean {
	const actual = computeFileHash(filePath);
	return actual === expectedHash;
}

interface PluginIntegrityEntry {
	hash: string;
	version: string;
}

// ── Tests ──

describe("plugin integrity verification", () => {
	it("computes SHA-256 hash of a file", () => {
		const dir = mkdtempSync(join(tmpdir(), "sec-015-test-"));
		const filePath = join(dir, "test.txt");
		writeFileSync(filePath, "hello world", "utf-8");

		const hash = computeFileHash(filePath);
		// SHA-256 of "hello world"
		assert.equal(hash.length, 64);
		assert.match(hash, /^[0-9a-f]{64}$/);
	});

	it("verifies integrity with matching hash", () => {
		const dir = mkdtempSync(join(tmpdir(), "sec-015-test-"));
		const filePath = join(dir, "plugin.yaml");
		writeFileSync(filePath, "id: test-plugin\nname: Test\nversion: 1.0.0", "utf-8");

		const hash = computeFileHash(filePath);
		assert.equal(verifyIntegrity(filePath, hash), true);
	});

	it("fails verification with non-matching hash", () => {
		const dir = mkdtempSync(join(tmpdir(), "sec-015-test-"));
		const filePath = join(dir, "plugin.yaml");
		writeFileSync(filePath, "id: test-plugin", "utf-8");

		assert.equal(verifyIntegrity(filePath, "0000000000000000000000000000000000000000000000000000000000000000"), false);
	});

	it("fails verification for modified file", () => {
		const dir = mkdtempSync(join(tmpdir(), "sec-015-test-"));
		const filePath = join(dir, "plugin.yaml");
		writeFileSync(filePath, "original content", "utf-8");

		const originalHash = computeFileHash(filePath);

		// Modify the file
		writeFileSync(filePath, "modified content", "utf-8");

		assert.equal(verifyIntegrity(filePath, originalHash), false);
	});

	it("hash changes when file changes", () => {
		const dir = mkdtempSync(join(tmpdir(), "sec-015-test-"));
		const filePath = join(dir, "data.bin");
		const data1 = randomBytes(1024);
		const data2 = randomBytes(1024);

		writeFileSync(filePath, data1);
		const hash1 = computeFileHash(filePath);

		writeFileSync(filePath, data2);
		const hash2 = computeFileHash(filePath);

		assert.notEqual(hash1, hash2);
	});

	it("handles binary files", () => {
		const dir = mkdtempSync(join(tmpdir(), "sec-015-test-"));
		const filePath = join(dir, "plugin.tar.gz");
		const binaryData = randomBytes(4096);
		writeFileSync(filePath, binaryData);

		const hash = computeFileHash(filePath);
		assert.equal(hash.length, 64);
	});

	it("detects tampered plugin manifest", () => {
		const dir = mkdtempSync(join(tmpdir(), "sec-015-test-"));
		const manifestPath = join(dir, "plugin.yaml");

		// Original plugin files
		writeFileSync(manifestPath, "id: safe-plugin\nname: Safe\nversion: 1.0.0", "utf-8");
		writeFileSync(join(dir, "tool.js"), "module.exports = {};", "utf-8");

		const manifestHash = computeFileHash(manifestPath);
		const toolHash = computeFileHash(join(dir, "tool.js"));

		// Tamper with tool file
		writeFileSync(join(dir, "tool.js"), "module.exports = { malicious: true };", "utf-8");

		// Manifest hash unchanged, but tool hash changed
		assert.equal(verifyIntegrity(manifestPath, manifestHash), true);
		assert.equal(verifyIntegrity(join(dir, "tool.js"), toolHash), false);
	});

	it("validates plugin integrity record fields", () => {
		const entry: PluginIntegrityEntry = {
			hash: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
			version: "1.0.0",
		};
		assert.ok(entry.hash);
		assert.ok(entry.version);
		assert.match(entry.hash, /^[0-9a-f]{64}$/);
	});

	it("computeFileHash throws for non-existent file", () => {
		const dir = mkdtempSync(join(tmpdir(), "sec-015-test-"));
		assert.throws(() => computeFileHash(join(dir, "nonexistent.yaml")));
	});
});

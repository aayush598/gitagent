import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";

const TEST_DIR = "/tmp/bug-008-test";
const ARCHIVE_PATH = join(TEST_DIR, "memory", "archive", "2026-05.md");

function buildArchiveEntry(existing: string, overflow: string, timestamp: string): string {
	const parts: string[] = [];
	if (!existing) {
		parts.push("---");
	} else if (existing.endsWith("\n")) {
		parts.push("---");
	} else {
		parts.push("");
		parts.push("---");
	}
	parts.push(`_Archived: ${timestamp}_`);
	parts.push("");
	parts.push(overflow);
	return parts.join("\n") + "\n";
}

describe("BUG-008: Memory Archive Newline Handling", () => {
	it("should not start with a newline for new archive files", () => {
		mkdirSync(join(TEST_DIR, "memory", "archive"), { recursive: true });
		const entry = buildArchiveEntry("", "# Overflow content", "2026-05-01T00:00:00.000Z_");
		writeFileSync(ARCHIVE_PATH, entry, "utf-8");
		const content = readFileSync(ARCHIVE_PATH, "utf-8");
		assert.equal(content.startsWith("\n"), false, "New archive file should not start with newline");
		rmSync(TEST_DIR, { recursive: true, force: true });
	});

	it("should not have double newline when appending to archive ending with \\n", () => {
		mkdirSync(join(TEST_DIR, "memory", "archive"), { recursive: true });
		writeFileSync(ARCHIVE_PATH, "# Prior archive\n", "utf-8");
		const existing = readFileSync(ARCHIVE_PATH, "utf-8");
		const entry = buildArchiveEntry(existing, "# More overflow", "2026-05-02T00:00:00.000Z_");
		writeFileSync(ARCHIVE_PATH, existing + entry, "utf-8");
		const content = readFileSync(ARCHIVE_PATH, "utf-8");
		const doubleNewlines = (content.match(/\n\n---/g) || []).length;
		assert.equal(doubleNewlines, 0, `Found ${doubleNewlines} double-newline before separator`);
		rmSync(TEST_DIR, { recursive: true, force: true });
	});

	it("should correctly add newline before separator when existing doesn't end with \\n", () => {
		mkdirSync(join(TEST_DIR, "memory", "archive"), { recursive: true });
		writeFileSync(ARCHIVE_PATH, "# Archive without final newline", "utf-8");
		const existing = readFileSync(ARCHIVE_PATH, "utf-8");
		assert.equal(existing.endsWith("\n"), false, "Test setup failed: file should not end with newline");
		const entry = buildArchiveEntry(existing, "# Third overflow", "2026-05-03T00:00:00.000Z_");
		writeFileSync(ARCHIVE_PATH, existing + entry, "utf-8");
		const content = readFileSync(ARCHIVE_PATH, "utf-8");
		assert.ok(content.includes("newline\n---"), "Newline should be present before separator when appending to non-newline-ending file");
		rmSync(TEST_DIR, { recursive: true, force: true });
	});

	it("should produce a well-formed markdown archive after multiple appends", () => {
		mkdirSync(join(TEST_DIR, "memory", "archive"), { recursive: true });

		let existing = "";
		for (let i = 0; i < 5; i++) {
			const entry = buildArchiveEntry(existing, `# Overflow batch ${i}`, `2026-05-${String(i + 1).padStart(2, "0")}T00:00:00.000Z_`);
			const data = (existing || "") + entry;
			writeFileSync(ARCHIVE_PATH, data, "utf-8");
			existing = readFileSync(ARCHIVE_PATH, "utf-8");
		}

		const content = readFileSync(ARCHIVE_PATH, "utf-8");
		const separators = (content.match(/^---$/gm) || []).length;
		assert.equal(separators, 5, `Expected 5 separators, found ${separators}`);
		assert.equal(content.startsWith("\n"), false, "Final archive should not start with newline");
		rmSync(TEST_DIR, { recursive: true, force: true });
	});
});

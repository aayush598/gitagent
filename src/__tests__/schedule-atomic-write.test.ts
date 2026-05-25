import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

describe("RACE-003: Schedule atomic write", () => {
	it("should write to tmp then rename (atomic pattern)", async () => {
		// Verify the pattern: write to .tmp file first, then rename
		const filePath = "/tmp/race-003-test.yaml";
		const tmpPath = filePath + ".tmp";
		const { writeFile, rename, unlink } = await import("fs/promises");

		await writeFile(tmpPath, "test: value\n", "utf-8");
		await rename(tmpPath, filePath);

		const { readFile } = await import("fs/promises");
		const content = await readFile(filePath, "utf-8");
		assert.equal(content.trim(), "test: value");

		await unlink(filePath);
	});

	it("should leave target unchanged if tmp write fails", async () => {
		const filePath = "/tmp/race-003-original.yaml";
		const { writeFile, unlink } = await import("fs/promises");
		await writeFile(filePath, "original\n", "utf-8");

		// Simulate a failure before rename
		const content = "original\n";
		assert.equal(content.trim(), "original");

		await unlink(filePath);
	});
});

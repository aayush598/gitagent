import { test } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";
import { mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { readFile } from "fs/promises";

test("safeWriteFile handles concurrent writes without race", async () => {
	const dir = mkdtempSync(join(tmpdir(), "file-007-"));
	const { safeWriteFile } = 	await import("../fs-utils.ts");

	const promises = Array.from({ length: 10 }, (_, i) =>
		safeWriteFile(join(dir, "sub", `file-${i}.txt`), `content-${i}`),
	);

	await Promise.all(promises);

	for (let i = 0; i < 10; i++) {
		const content = await readFile(join(dir, "sub", `file-${i}.txt`), "utf-8");
		strictEqual(content, `content-${i}`);
	}
});

test("safeWriteFile creates parent directories", async () => {
	const dir = mkdtempSync(join(tmpdir(), "file-007-dir-"));
	const { safeWriteFile } = 	await import("../fs-utils.ts");

	await safeWriteFile(join(dir, "a", "b", "c", "test.txt"), "nested");
	const content = await readFile(join(dir, "a", "b", "c", "test.txt"), "utf-8");
	strictEqual(content, "nested");
});

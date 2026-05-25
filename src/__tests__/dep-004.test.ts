import { test } from "node:test";
import { ok } from "node:assert";
import { readFileSync, existsSync } from "node:fs";

test("package-lock.json exists in project root", () => {
	ok(existsSync("package-lock.json"), "package-lock.json should be present");
});

test("package-lock.json is included in published files", () => {
	const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
	ok(pkg.files.includes("package-lock.json"), "package-lock.json should be in files array");
});

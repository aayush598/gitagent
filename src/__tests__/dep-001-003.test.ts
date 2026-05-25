import { test } from "node:test";
import { strictEqual, ok } from "node:assert";
import { readFileSync } from "node:fs";

test("yaml library is used instead of js-yaml", () => {
	const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
	ok(!pkg.dependencies["js-yaml"], "js-yaml should not be a dependency");
	ok(pkg.dependencies["yaml"], "yaml should be a dependency");
});

test("yaml.yaml2 can parse and stringify", () => {
	async function testYaml() {
		const yaml = await import("yaml");
		const parsed = yaml.parse("a: 1\nb: hello") as any;
		strictEqual(parsed.a, 1);
		strictEqual(parsed.b, "hello");

		const str = yaml.stringify({ x: [1, 2, 3] });
		ok(str.includes("x:"));
		ok(str.includes("- 1"));
	}
	return testYaml();
});

test("yaml parse handles frontmatter", () => {
	async function testFm() {
		const yaml = await import("yaml");
		const fm = yaml.parse("name: test\nversion: v1.0") as any;
		strictEqual(fm.name, "test");
		strictEqual(fm.version, "v1.0");
	}
	return testFm();
});

test("stringify without noRefs matches frontmatter expectations", () => {
	async function testStr() {
		const yaml = await import("yaml");
		const fm = { name: "test", description: "hello world" };
		const out = yaml.stringify(fm, { lineWidth: -1 }).trimEnd();
		ok(out.includes("name: test"));
		ok(out.includes("description: hello world"));
	}
	return testStr();
});

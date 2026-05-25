import { test } from "node:test";
import { strictEqual, ok } from "node:assert";
import { readFileSync } from "fs";
import yaml from "js-yaml";

test("agent.yaml has a valid preferred model", () => {
	const repoConfig = yaml.load(readFileSync("agent.yaml", "utf-8")) as any;
	ok(repoConfig.model?.preferred, "agent.yaml should have a preferred model");
	ok(repoConfig.model.preferred !== "", "model.preferred should not be empty");
	ok(repoConfig.model.preferred.includes(":"), "model.preferred should be in provider:model format");
});

test("loadAgent validates empty manifest", async () => {
	const { loadAgent } = await import("../loader.ts");
	try {
		await loadAgent("/nonexistent", undefined);
		ok(false, "should have thrown");
	} catch (err: any) {
		ok(err.message.includes("agent.yaml") || err.message.includes("model.preferred"));
	}
});

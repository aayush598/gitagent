import { test } from "node:test";
import { ok } from "node:assert";

test("empty agent.yaml throws descriptive error", () => {
	function validate(raw: string): void {
		if (!raw.trim()) {
			throw new Error("agent.yaml is empty. Delete the file and run again.");
		}
		try {
			const parsed = JSON.parse(raw);
			if (!parsed || typeof parsed !== "object") {
				throw new Error("agent.yaml does not contain a valid configuration object.");
			}
		} catch (err: any) {
			if (err.message.startsWith("agent.yaml")) throw err;
			throw new Error("agent.yaml has a YAML syntax error:\n  " + err.message);
		}
	}

	try {
		validate("");
		ok(false, "should have thrown");
	} catch (err: any) {
		ok(err.message.includes("empty"), "empty file should mention empty");
	}

	try {
		validate("broken: [yaml");
		ok(false, "should have thrown");
	} catch (err: any) {
		ok(err.message.includes("syntax error"), "malformed YAML should mention syntax error");
	}
});

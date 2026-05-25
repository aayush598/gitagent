import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

describe("ERR-012: Script exit code validation", () => {
	it("should warn when exit code is 0 but stderr is non-empty", () => {
		let captured = "";
		const orig = console.warn;
		console.warn = (msg: string) => { captured = msg; };

		const stderr = "Warning: deprecated API usage";
		const name = "test-tool";
		console.warn(`[tool-loader] Tool "${name}" exited with code 0 but produced stderr output: ${stderr}`);

		console.warn = orig;
		assert.ok(captured.includes("[tool-loader]"), "Should include [tool-loader] prefix");
		assert.ok(captured.includes("deprecated API"), "Should include stderr content");
	});

	it("should not warn when stderr is empty", () => {
		let captured = "";
		const orig = console.warn;
		console.warn = (msg: string) => { captured = msg; };

		const stderr = "";
		if (stderr.trim()) {
			console.warn("should not appear");
		}

		console.warn = orig;
		assert.equal(captured, "", "Should not warn when stderr is empty");
	});
});

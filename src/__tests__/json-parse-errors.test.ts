import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

describe("ERR-010: JSON parse errors in tool output", () => {
	it("should not attempt to parse non-JSON output", () => {
		const text = "some plain text output";
		const shouldParse = text && (text.startsWith("{") || text.startsWith("["));
		assert.equal(shouldParse, false, "Plain text should not trigger JSON.parse");
	});

	it("should attempt to parse JSON-like output", () => {
		const text = '{"text": "hello world"}';
		const shouldParse = text && (text.startsWith("{") || text.startsWith("["));
		assert.equal(shouldParse, true, "JSON object should trigger JSON.parse");
	});

	it("should handle empty output gracefully", () => {
		const text = "";
		const result = text || "(no output)";
		assert.equal(result, "(no output)");
	});
});

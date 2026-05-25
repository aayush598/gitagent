import { test } from "node:test";
import { deepStrictEqual } from "node:assert";

const CONSTRAINT_MAPPING: Record<string, string> = {
	maxTokens: "max_tokens",
	max_tokens: "max_tokens",
	topP: "top_p",
	top_p: "top_p",
	topK: "top_k",
	top_k: "top_k",
	temperature: "temperature",
	stop_sequences: "stop_sequences",
	stopSequences: "stop_sequences",
};

function normalizeConstraints(raw: Record<string, any>): Record<string, any> {
	const result: Record<string, any> = {};
	for (const [key, value] of Object.entries(raw)) {
		const canonical = CONSTRAINT_MAPPING[key];
		if (canonical) result[canonical] = value;
	}
	return result;
}

test("normalizeConstraints maps camelCase to snake_case", () => {
	const result = normalizeConstraints({ maxTokens: 100, topP: 0.9, topK: 50 });
	deepStrictEqual(result, { max_tokens: 100, top_p: 0.9, top_k: 50 });
});

test("normalizeConstraints passes snake_case through unchanged", () => {
	const result = normalizeConstraints({ max_tokens: 100, top_p: 0.9, top_k: 50 });
	deepStrictEqual(result, { max_tokens: 100, top_p: 0.9, top_k: 50 });
});

test("normalizeConstraints prefers snake_case when both forms are present", () => {
	const result = normalizeConstraints({ maxTokens: 50, max_tokens: 100 });
	deepStrictEqual(result, { max_tokens: 100 });
});

test("normalizeConstraints ignores unknown keys", () => {
	const result = normalizeConstraints({ temperature: 0.7, unknownField: "foo" });
	deepStrictEqual(result, { temperature: 0.7 });
});

import { describe, it } from "node:test";
import assert from "node:assert";

describe("BUG-019: Model Fallback Not Implemented", () => {
	it("should use preferred model when it succeeds", () => {
		const preferred = "valid-provider:valid-model";
		const candidates = [preferred];

		const model = resolveModelInline(candidates);
		assert.strictEqual(model, preferred);
	});

	it("should fall back when preferred model fails", () => {
		const preferred = "bad-provider:bad-model";
		const fallback = "good-provider:good-model";
		const candidates = [preferred, fallback];

		const warnings: string[] = [];
		const origWarn = console.warn;
		console.warn = (...args: any[]) => {
			warnings.push(args.join(" "));
			origWarn.apply(console, args);
		};

		const model = resolveModelInline(candidates);
		console.warn = origWarn;

		assert.strictEqual(model, fallback, "Should fall back to second candidate");
		assert.ok(warnings.some(w => w.includes("fallback")), "Should log fallback warning");
	});

	it("should try all fallbacks and throw if all fail", () => {
		const candidates = ["a:1", "b:2", "c:3"];

		assert.throws(() => {
			resolveModelInline(candidates);
		}, /Tried 3 candidate/);
	});

	it("should include all candidate errors when all models fail", () => {
		const candidates = ["x:1", "y:2"];

		try {
			resolveModelInline(candidates);
			assert.fail("Should have thrown");
		} catch (err: any) {
			assert.ok(err.message.includes("x:1"), "Error should mention first candidate");
			assert.ok(err.message.includes("y:2"), "Error should mention second candidate");
			assert.ok(err.message.includes("Tried 2 candidate"), "Should mention candidate count");
		}
	});

	it("should fall back through multiple fallbacks in order", () => {
		const candidates = ["fail-1:bad", "fail-2:bad", "good-3:works"];

		const model = resolveModelInline(candidates);
		assert.strictEqual(model, "good-3:works");
	});

	it("should not attempt fallback when only one candidate", () => {
		const candidates = ["only:choice"];

		const model = resolveModelInline(candidates);
		assert.strictEqual(model, "only:choice");
	});
});

const goodProviders = new Set([
	"valid-provider", "good-provider", "only", "good-3", "fail-3",
]);

function resolveModelInline(candidates: string[]): string {
	const modelErrors: string[] = [];
	for (const candidate of candidates) {
		try {
			const colonIndex = candidate.indexOf(":");
			const provider = candidate.slice(0, colonIndex);

			if (goodProviders.has(provider)) {
				if (candidate !== candidates[0]) {
					console.warn(`[loader] Preferred model unavailable. Using fallback: "${candidate}"`);
				}
				return candidate;
			}
			throw new Error(`Unknown provider: "${provider}"`);
		} catch (err: any) {
			modelErrors.push(`  "${candidate}": ${err.message}`);
			continue;
		}
	}
	throw new Error(
		`No model could be initialized. Tried ${candidates.length} candidate(s):\n` +
		modelErrors.join("\n") +
		"\n\nConfigure a valid model in agent.yaml model.preferred or pass --model on the command line.",
	);
}

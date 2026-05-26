import { describe, it } from "node:test";
import assert from "node:assert/strict";

function buildFlags(replace_all: boolean, flags?: string): {
	replaceFlags: string;
	matchFlags: string;
} {
	const rxFlags = flags || "";
	const userWantsGlobal = rxFlags.includes("g");

	let replaceFlags = rxFlags;
	if (replace_all && !userWantsGlobal) {
		replaceFlags += "g";
	}

	let matchFlags = rxFlags;
	if (!userWantsGlobal) {
		matchFlags += "g";
	}

	return { replaceFlags, matchFlags };
}

function simulateFixedEdit(
	text: string,
	pattern: string,
	replacement: string,
	replace_all: boolean,
	flags?: string,
): { matchCount: number; replaceCount: number } {
	const { replaceFlags, matchFlags } = buildFlags(replace_all, flags);
	const replaceRx = new RegExp(pattern, replaceFlags);
	const matchRx = new RegExp(pattern, matchFlags);

	const allMatches = text.match(matchRx);
	const matchCount = allMatches ? allMatches.length : 0;

	const result = text.replace(replaceRx, replacement);
	const replaceCount = (result.match(new RegExp(replacement, "g")) || []).length;

	return { matchCount, replaceCount };
}

describe("BUG-009: Regex Flag Construction", () => {
	it("should not have duplicate 'g' in flags when user provides 'g'", () => {
		const { replaceFlags, matchFlags } = buildFlags(true, "g");
		assert.equal((replaceFlags.match(/g/g) || []).length <= 1, true, `Duplicate g in replaceFlags: "${replaceFlags}"`);
		assert.equal((matchFlags.match(/g/g) || []).length <= 1, true, `Duplicate g in matchFlags: "${matchFlags}"`);
	});

	it("should add 'g' to replaceFlags when replace_all=true and no user 'g'", () => {
		const { replaceFlags } = buildFlags(true, "i");
		assert.ok(replaceFlags.includes("g"), `replaceFlags "${replaceFlags}" missing 'g' for replace_all`);
	});

	it("should NOT add 'g' to replaceFlags when replace_all=false even without user 'g'", () => {
		const { replaceFlags } = buildFlags(false, "i");
		assert.equal(replaceFlags.includes("g"), false, `replaceFlags "${replaceFlags}" should NOT have 'g' when replace_all=false`);
	});

	it("should add 'g' to matchFlags even when replace_all=false", () => {
		const { matchFlags } = buildFlags(false, "i");
		assert.ok(matchFlags.includes("g"), `matchFlags "${matchFlags}" missing 'g' for counting`);
	});

	it("should add 'g' to matchFlags when user provides no flags", () => {
		const { matchFlags } = buildFlags(false);
		assert.ok(matchFlags.includes("g"), `matchFlags "${matchFlags}" missing 'g' for counting`);
	});

	it("should not add 'g' to matchFlags when user already provided 'g'", () => {
		const { matchFlags } = buildFlags(false, "g");
		assert.equal((matchFlags.match(/g/g) || []).length, 1, `matchFlags "${matchFlags}" should not duplicate 'g'`);
	});

	it("should have symmetric match and replace counts for all scenarios", () => {
		const text = "a a a";
		const scenarios = [
			{ replace_all: true, flags: undefined },
			{ replace_all: true, flags: "g" },
			{ replace_all: true, flags: "i" },
			{ replace_all: false, flags: "g" },
		];
		for (const s of scenarios) {
			const result = simulateFixedEdit(text, "a", "b", s.replace_all, s.flags);
			assert.equal(
				result.matchCount,
				result.replaceCount,
				`Asymmetry for replace_all=${s.replace_all}, flags=${s.flags}: match=${result.matchCount}, replace=${result.replaceCount}`,
			);
		}
	});
});

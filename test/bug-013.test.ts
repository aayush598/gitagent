import { describe, it } from "node:test";

const summarizingBranches = new Set<string>();

async function summarizeHistoryFixed(
	agentDir: string,
	branch: string,
	simulateQuery: () => Promise<void>,
): Promise<string> {
	const guardKey = `${agentDir}:${branch}`;
	if (summarizingBranches.has(guardKey)) {
		return ""; // Guard triggered
	}
	summarizingBranches.add(guardKey);

	try {
		await simulateQuery();
		return "Test summary";
	} finally {
		summarizingBranches.delete(guardKey);
	}
}

describe("BUG-013: Summarization Recursion Guard", () => {
	it("should allow first summarization call", async () => {
		let queryCalled = false;
		const result = await summarizeHistoryFixed("/tmp/test", "main", async () => {
			queryCalled = true;
		});
		if (result !== "Test summary") {
			throw new Error(`Expected "Test summary", got "${result}"`);
		}
		if (!queryCalled) {
			throw new Error("Query should have been called");
		}
	});

	it("should block re-entrant calls", async () => {
		let callCount = 0;

		async function inner() {
			callCount++;
			const reentrantResult = await summarizeHistoryFixed("/tmp/test", "main", async () => {});
			if (reentrantResult !== "") {
				throw new Error("Reentrant call should have been blocked");
			}
		}

		const result = await summarizeHistoryFixed("/tmp/test", "main", inner);
		if (result !== "Test summary") {
			throw new Error(`Expected "Test summary", got "${result}"`);
		}
		if (callCount !== 1) {
			throw new Error(`Expected 1 reentrant call attempt, got ${callCount}`);
		}
	});

	it("should allow concurrent calls on different branches", async () => {
		const results = await Promise.all([
			summarizeHistoryFixed("/tmp/test", "main", async () => {}),
			summarizeHistoryFixed("/tmp/test", "feature/branch", async () => {}),
		]);

		if (results.some(r => r === "")) {
			throw new Error("Both branches should have returned summaries");
		}
	});

	it("should clean up guard state in finally block", () => {
		if (summarizingBranches.size > 0) {
			throw new Error(`Guard set not empty: ${[...summarizingBranches].join(", ")}`);
		}
	});
});

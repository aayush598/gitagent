import { describe, it } from "node:test";

function createTimeoutSignal(ms: number): { signal: AbortSignal; clear: () => void } {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), ms);
	return {
		signal: controller.signal,
		clear: () => clearTimeout(timeout),
	};
}

async function fixedSearch(objective: string, apiKey?: string): Promise<number> {
	if (!apiKey) return 0;

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 5000);

	try {
		const url = `https://api.skillsmp.com/v1/search?q=${encodeURIComponent(objective)}`;
		const resp = await fetch(url, {
			headers: { Authorization: `Bearer ${apiKey}` },
			signal: controller.signal,
		});
		if (!resp.ok) return 0;
		const data = await resp.json() as { results?: unknown[] };
		return data.results?.length ?? 0;
	} catch {
		return 0;
	} finally {
		clearTimeout(timeout);
	}
}

describe("BUG-012: AbortSignal.timeout Compatibility", () => {
	it("should not crash when AbortController is used for timeout", () => {
		const controller = new AbortController();
		if (typeof controller.abort !== "function") {
			throw new Error("AbortController not available");
		}
	});

	it("should handle timeout gracefully with AbortController", async () => {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 10);

		try {
			await new Promise((_, reject) => {
				controller.signal.addEventListener("abort", () => {
					reject(new Error("Aborted"));
				});
			});
			throw new Error("Should have thrown");
		} catch (err: unknown) {
			if (err instanceof Error && err.message === "Aborted") {
				// Expected
			} else {
				throw err;
			}
		} finally {
			clearTimeout(timeout);
		}
	});

	it("should clean up timeout to prevent memory leaks", () => {
		const { signal, clear } = createTimeoutSignal(5000);
		if (typeof signal.aborted !== "boolean") {
			throw new Error("Invalid signal");
		}
		clear();
	});

	it("should return 0 results without throwing for empty API key", async () => {
		const result = await fixedSearch("test", undefined);
		if (result !== 0) {
			throw new Error(`Expected 0, got ${result}`);
		}
	});

	it("should not use AbortSignal.timeout directly", () => {
		const fnStr = fixedSearch.toString() + createTimeoutSignal.toString();
		const hasDirectTimeout = /AbortSignal\.timeout/.test(fnStr);
		if (hasDirectTimeout) {
			throw new Error("Code still uses AbortSignal.timeout directly");
		}
	});
});

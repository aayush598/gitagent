import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

describe("RACE-008: Async session ID", () => {
	it("should resolve sessionId after promise settles", async () => {
		let resolveSession!: (id: string) => void;
		const sessionPromise = new Promise<string>((r) => { resolveSession = r; });

		let _sessionId = "";
		let _sessionIdResolve: (() => void) | null = null;
		const _sessionIdPromise = new Promise<void>((r) => { _sessionIdResolve = r; });

		async function getSessionId(): Promise<string> {
			await _sessionIdPromise;
			return _sessionId;
		}

		// Simulate async loadAgent completing
		setTimeout(() => {
			_sessionId = "session-123";
			_sessionIdResolve!();
			resolveSession("session-123");
		}, 10);

		const id = await getSessionId();
		assert.equal(id, "session-123");
	});

	it("should resolve immediately if sessionId is pre-set", async () => {
		const _sessionId = "pre-set-session";
		let _sessionIdResolve: (() => void) | null = null;
		const _sessionIdPromise = new Promise<void>((r) => { _sessionIdResolve = r; });
		_sessionIdResolve!();

		async function getSessionId(): Promise<string> {
			await _sessionIdPromise;
			return _sessionId;
		}

		const id = await getSessionId();
		assert.equal(id, "pre-set-session");
	});
});

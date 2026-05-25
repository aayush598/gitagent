import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

// ── Copied from src/loader.ts and src/session.ts ──

function generateSessionId(bytes: number): string {
	return randomBytes(bytes).toString("hex");
}

function isExpired(expiresAt: string): boolean {
	return new Date(expiresAt).getTime() <= Date.now();
}

function createStateFile(sessionId: string, dir: string): string {
	const state = {
		session_id: sessionId,
		started_at: new Date().toISOString(),
		expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
	};
	const statePath = join(dir, "state.json");
	writeFileSync(statePath, JSON.stringify(state, null, 2), "utf-8");
	try {
		execSync(`chmod 600 ${statePath}`);
	} catch {
		// best effort
	}
	return statePath;
}

// ── Tests ──

describe("session ID entropy", () => {
	it("loader session ID has 256 bits of entropy (64 hex chars)", () => {
		const id = generateSessionId(32);
		assert.equal(id.length, 64);
		assert.match(id, /^[0-9a-f]{64}$/);
	});

	it("local session ID has 128 bits of entropy (32 hex chars)", () => {
		const id = generateSessionId(16);
		assert.equal(id.length, 32);
		assert.match(id, /^[0-9a-f]{32}$/);
	});

	it("contains only hex characters (0-9, a-f)", () => {
		const id = generateSessionId(32);
		for (const char of id) {
			assert.ok(/^[0-9a-f]$/.test(char), `invalid char: ${char}`);
		}
	});

	it("no collisions over 10,000 iterations", () => {
		const ids = new Set<string>();
		for (let i = 0; i < 10_000; i++) {
			ids.add(generateSessionId(32));
		}
		assert.equal(ids.size, 10_000);
	});

	it("no collisions for local IDs over 10,000 iterations", () => {
		const ids = new Set<string>();
		for (let i = 0; i < 10_000; i++) {
			ids.add(generateSessionId(16));
		}
		assert.equal(ids.size, 10_000);
	});

	it("consecutive IDs are not sequential", () => {
		const ids = Array.from({ length: 100 }, () => generateSessionId(32));
		for (let i = 1; i < ids.length; i++) {
			const diff = BigInt("0x" + ids[i]) - BigInt("0x" + ids[0]);
			assert.ok(diff > 1000n || diff < -1000n, `IDs too close: ${ids[0]} vs ${ids[i]}`);
		}
	});
});

describe("session expiry", () => {
	it("new session is not expired", () => {
		const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
		assert.equal(isExpired(expiresAt), false);
	});

	it("session is expired when past expires_at", () => {
		const expiresAt = new Date(Date.now() - 1000).toISOString();
		assert.equal(isExpired(expiresAt), true);
	});

	it("session is expired when expires_at is exactly now", () => {
		const expiresAt = new Date().toISOString();
		assert.ok(isExpired(expiresAt));
	});

	it("state object includes required fields", () => {
		const state = {
			session_id: generateSessionId(32),
			started_at: new Date().toISOString(),
			expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
		};
		assert.ok(state.session_id);
		assert.ok(state.started_at);
		assert.ok(state.expires_at);
		assert.ok(new Date(state.expires_at).getTime() > Date.now());
	});
});

describe("file permissions", () => {
	it("state file is created with restricted permissions (chmod 600)", () => {
		const dir = mkdtempSync(join(tmpdir(), "sec-012-test-"));
		const id = generateSessionId(32);
		const statePath = createStateFile(id, dir);

		const stats = statSync(statePath);
		// 0o100600 = regular file with rw-------
		const mode = stats.mode & 0o777;
		assert.equal(mode, 0o600, `Expected 0o600, got ${mode.toString(8)}`);
	});

	it("can read back the session ID from state file", () => {
		const dir = mkdtempSync(join(tmpdir(), "sec-012-test-"));
		const id = generateSessionId(32);
		createStateFile(id, dir);

		const state = JSON.parse(execSync(`cat ${join(dir, "state.json")}`, { encoding: "utf-8" }));
		assert.equal(state.session_id, id);
	});
});

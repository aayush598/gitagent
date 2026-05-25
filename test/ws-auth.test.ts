import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

// ── Copied functions from server.ts (standalone, no external deps) ──

function generateAuthToken(username: string, password: string, salt: string): string {
	return crypto.createHash("sha256")
		.update(`${username}:${password}:${salt}`)
		.digest("hex")
		.slice(0, 32);
}

function isAuthenticated(cookieHeader: string, expectedToken: string): boolean {
	const match = cookieHeader.match(/gitclaw_auth=([^;]+)/);
	return match?.[1] === expectedToken;
}

function timingSafeEqualStr(a: string, b: string): boolean {
	const ab = Buffer.from(a);
	const bb = Buffer.from(b);
	if (ab.length !== bb.length) return false;
	return crypto.timingSafeEqual(ab, bb);
}

function checkLoginRateLimit(
	attempts: { count: number; resetTime: number },
	now: number,
): boolean {
	if (now > attempts.resetTime) {
		attempts.count = 0;
		attempts.resetTime = now + 1000;
	}
	attempts.count++;
	return attempts.count <= 5;
}

function isAllowedOrigin(origin: string): boolean {
	if (!origin) return false;
	return origin.startsWith("http://localhost") ||
		origin.startsWith("http://127.0.0.1") ||
		origin.startsWith("http://[::1]");
}

// ── Tests ──

describe("voice server auth", () => {
	describe("generateAuthToken", () => {
		it("produces deterministic output for same inputs", () => {
			const a = generateAuthToken("admin", "secret", "abc123");
			const b = generateAuthToken("admin", "secret", "abc123");
			assert.equal(a, b);
		});

		it("changes when password changes", () => {
			const a = generateAuthToken("admin", "secret1", "abc123");
			const b = generateAuthToken("admin", "secret2", "abc123");
			assert.notEqual(a, b);
		});

		it("changes when salt changes", () => {
			const a = generateAuthToken("admin", "secret", "salt1");
			const b = generateAuthToken("admin", "secret", "salt2");
			assert.notEqual(a, b);
		});

		it("returns 32-char hex string", () => {
			const token = generateAuthToken("admin", "secret", "salt");
			assert.match(token, /^[0-9a-f]{32}$/);
		});
	});

	describe("isAuthenticated", () => {
		it("returns true for valid cookie", () => {
			const token = generateAuthToken("admin", "pass", "salt");
			assert.equal(isAuthenticated(`gitclaw_auth=${token}`, token), true);
		});

		it("returns false for invalid cookie", () => {
			const token = generateAuthToken("admin", "pass", "salt");
			assert.equal(isAuthenticated("gitclaw_auth=invalidtoken", token), false);
		});

		it("returns false when no cookie header", () => {
			const token = generateAuthToken("admin", "pass", "salt");
			assert.equal(isAuthenticated("", token), false);
		});

		it("returns false when auth cookie is missing among other cookies", () => {
			const token = generateAuthToken("admin", "pass", "salt");
			assert.equal(isAuthenticated("other=value", token), false);
		});
	});

	describe("timingSafeEqualStr", () => {
		it("returns true for equal strings", () => {
			assert.equal(timingSafeEqualStr("admin", "admin"), true);
		});

		it("returns false for different strings", () => {
			assert.equal(timingSafeEqualStr("admin", "Admin"), false);
		});

		it("returns false for different lengths", () => {
			assert.equal(timingSafeEqualStr("admin", "adminx"), false);
		});

		it("returns false for empty vs non-empty", () => {
			assert.equal(timingSafeEqualStr("", "admin"), false);
		});

		it("returns true for two empty strings", () => {
			assert.equal(timingSafeEqualStr("", ""), true);
		});
	});

	describe("checkLoginRateLimit", () => {
		it("allows first 5 attempts within window", () => {
			const state = { count: 0, resetTime: Date.now() + 1000 };
			for (let i = 0; i < 5; i++) {
				assert.equal(checkLoginRateLimit(state, Date.now()), true);
			}
		});

		it("blocks 6th attempt within window", () => {
			const state = { count: 0, resetTime: Date.now() + 1000 };
			for (let i = 0; i < 5; i++) checkLoginRateLimit(state, Date.now());
			assert.equal(checkLoginRateLimit(state, Date.now()), false);
		});

		it("resets after window expires", () => {
			const state = { count: 0, resetTime: Date.now() + 1000 };
			for (let i = 0; i < 5; i++) checkLoginRateLimit(state, Date.now());
			// Advance time past window
			assert.equal(checkLoginRateLimit(state, Date.now() + 2000), true);
		});
	});

	describe("isAllowedOrigin", () => {
		it("allows localhost with port", () => {
			assert.equal(isAllowedOrigin("http://localhost:3333"), true);
		});

		it("allows 127.0.0.1 with port", () => {
			assert.equal(isAllowedOrigin("http://127.0.0.1:3333"), true);
		});

		it("allows IPv6 loopback", () => {
			assert.equal(isAllowedOrigin("http://[::1]:3333"), true);
		});

		it("rejects empty origin", () => {
			assert.equal(isAllowedOrigin(""), false);
		});

		it("rejects external origin", () => {
			assert.equal(isAllowedOrigin("https://evil.com"), false);
		});

		it("rejects null origin", () => {
			assert.equal(isAllowedOrigin("null"), false);
		});
	});
});

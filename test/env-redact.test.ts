import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ── Copied from src/tools/env-redact.ts ──

const SAFE_ENV_KEYS = new Set([
	"PATH", "HOME", "USER", "SHELL", "TERM",
	"LANG", "LC_ALL", "TZ", "PWD",
	"TMPDIR", "TEMP", "LOGNAME",
]);

const SENSITIVE_PATTERNS = [
	/sk-[a-zA-Z0-9]{20,}/g,
	/sk-proj-[a-zA-Z0-9]{20,}/g,
	/gh[opsu]_[a-zA-Z0-9]{36,}/g,
	/AKIA[0-9A-Z]{16}/g,
	/(?<=https:\/\/)[^:@\s]+:[^@\s]+@/g,
	/-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END \1?PRIVATE KEY-----/g,
];

function createSafeEnv(): Record<string, string | undefined> {
	const env: Record<string, string | undefined> = {};
	for (const key of SAFE_ENV_KEYS) {
		if (key in process.env) {
			env[key] = process.env[key];
		}
	}
	return env;
}

function scrubOutput(text: string): string {
	for (const pattern of SENSITIVE_PATTERNS) {
		text = text.replace(pattern, "[REDACTED]");
	}
	return text;
}

// ── Tests ──

describe("createSafeEnv", () => {
	it("includes PATH", () => {
		const env = createSafeEnv();
		assert.equal(typeof env.PATH, "string");
	});

	it("excludes OPENAI_API_KEY", () => {
		process.env.OPENAI_API_KEY = "sk-fake-test-key-12345";
		const env = createSafeEnv();
		assert.equal(env.OPENAI_API_KEY, undefined);
		delete process.env.OPENAI_API_KEY;
	});

	it("excludes ANTHROPIC_API_KEY", () => {
		process.env.ANTHROPIC_API_KEY = "sk-ant-fake-test-key-12345";
		const env = createSafeEnv();
		assert.equal(env.ANTHROPIC_API_KEY, undefined);
		delete process.env.ANTHROPIC_API_KEY;
	});

	it("excludes random secret env vars", () => {
		process.env.MY_SECRET_TOKEN = "super-secret-value";
		const env = createSafeEnv();
		assert.equal(env.MY_SECRET_TOKEN, undefined);
		delete process.env.MY_SECRET_TOKEN;
	});

	it("includes TMPDIR when set", () => {
		process.env.TMPDIR = "/tmp";
		const env = createSafeEnv();
		assert.equal(env.TMPDIR, "/tmp");
		delete process.env.TMPDIR;
	});
});

describe("scrubOutput", () => {
	it("redacts OpenAI API keys (sk-...)", () => {
		const result = scrubOutput("api key: sk-abcDEFghijklmnopqrstuvwxyz");
		assert.equal(result, "api key: [REDACTED]");
	});

	it("redacts OpenAI project keys (sk-proj-...)", () => {
		const result = scrubOutput("project key: sk-proj-abcDEFghijklmnopqrstuvwxyz");
		assert.equal(result, "project key: [REDACTED]");
	});

	it("redacts GitHub tokens (ghp_/gho_/ghs_/ghu_)", () => {
		const result = scrubOutput("token: ghp_abcdefghijklmnopqrstuvwxyz123456789012");
		assert.equal(result, "token: [REDACTED]");
	});

	it("redacts AWS access keys (AKIA...)", () => {
		const result = scrubOutput("aws key: AKIAIOSFODNN7EXAMPLE");
		assert.equal(result, "aws key: [REDACTED]");
	});

	it("redacts basic auth in URLs", () => {
		const result = scrubOutput("curl https://user:password@example.com/api");
		assert.equal(result, "curl https://[REDACTED]example.com/api");
	});

	it("redacts RSA private keys", () => {
		const key = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA
-----END RSA PRIVATE KEY-----`;
		const result = scrubOutput(key);
		assert.equal(result, "[REDACTED]");
	});

	it("redacts EC private keys", () => {
		const key = `-----BEGIN EC PRIVATE KEY-----
MIIEpAIBAAKCAQEA
-----END EC PRIVATE KEY-----`;
		const result = scrubOutput(key);
		assert.equal(result, "[REDACTED]");
	});

	it("redacts OPENSSH private keys", () => {
		const key = `-----BEGIN OPENSSH PRIVATE KEY-----
MIIEpAIBAAKCAQEA
-----END OPENSSH PRIVATE KEY-----`;
		const result = scrubOutput(key);
		assert.equal(result, "[REDACTED]");
	});

	it("redacts generic private keys (no prefix)", () => {
		const key = `-----BEGIN PRIVATE KEY-----
MIIEpAIBAAKCAQEA
-----END PRIVATE KEY-----`;
		const result = scrubOutput(key);
		assert.equal(result, "[REDACTED]");
	});

	it("passes safe text through unchanged", () => {
		const text = "Hello, world! This is safe output.";
		assert.equal(scrubOutput(text), text);
	});

	it("handles empty string", () => {
		assert.equal(scrubOutput(""), "");
	});

	it("redacts multiple sensitive values in same output", () => {
		const text = "OPENAI_API_KEY=sk-abcDEFghijklmnopqrstuvwxyz\nAWS_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE";
		const result = scrubOutput(text);
		assert.equal(result, "OPENAI_API_KEY=[REDACTED]\nAWS_ACCESS_KEY=[REDACTED]");
	});

	it("does not redact short strings resembling key prefixes", () => {
		const text = "The word 'skill' contains no key. Also 'skip' is fine.";
		assert.equal(scrubOutput(text), text);
	});
});

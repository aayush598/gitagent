import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface SessionState {
	session_id: string;
	started_at: string;
}

function createSessionState(sessionId: string): SessionState {
	return { session_id: sessionId, started_at: new Date().toISOString() };
}

function writeSessionStateToDisk(dir: string, state: SessionState): void {
	mkdirSync(join(dir, ".gitagent"), { recursive: true });
	writeFileSync(
		join(dir, ".gitagent", "state.json"),
		JSON.stringify(state, null, 2),
	);
}

function readSessionStateFromDisk(dir: string): SessionState | null {
	try {
		return JSON.parse(readFileSync(join(dir, ".gitagent", "state.json"), "utf-8"));
	} catch {
		return null;
	}
}

function loadAgentWithBug(dir: string): { sessionId: string; error: string | null } {
	const sessionId = crypto.randomUUID();
	writeSessionStateToDisk(dir, createSessionState(sessionId));
	if (!existsSync(join(dir, "agent.yaml"))) {
		return { sessionId, error: "agent.yaml not found" };
	}
	return { sessionId, error: null };
}

function loadAgentWithFix(dir: string): { sessionId: string | null; error: string | null } {
	if (!existsSync(join(dir, "agent.yaml"))) {
		return { sessionId: null, error: "agent.yaml not found" };
	}
	const sessionId = crypto.randomUUID();
	writeSessionStateToDisk(dir, createSessionState(sessionId));
	return { sessionId, error: null };
}

test("BUG behaviour: state written before validation creates orphaned state.json on failure", () => {
	const dir = join(tmpdir(), "bug-015-bug-" + Date.now());
	mkdirSync(dir, { recursive: true });
	try {
		const result = loadAgentWithBug(dir);
		assert.ok(result.error, "should report error");
		const state = readSessionStateFromDisk(dir);
		assert.ok(state, "state.json should exist (BUG: written before validation)");
		assert.equal(state!.session_id, result.sessionId,
			"orphaned session ID matches the one written before validation");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("FIX: no state written when validation fails — order is validation before state write", () => {
	const dir = join(tmpdir(), "bug-015-fix-" + Date.now());
	mkdirSync(dir, { recursive: true });
	try {
		const result = loadAgentWithFix(dir);
		assert.ok(result.error, "should report error");
		assert.equal(result.sessionId, null, "no sessionId returned on failure");
		const state = readSessionStateFromDisk(dir);
		assert.equal(state, null, "state.json must NOT exist when validation fails");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("FIX: state written only after successful validation", () => {
	const dir = join(tmpdir(), "bug-015-valid-" + Date.now());
	mkdirSync(dir, { recursive: true });
	try {
		writeFileSync(join(dir, "agent.yaml"), "name: test");
		const result = loadAgentWithFix(dir);
		assert.equal(result.error, null, "no error for valid config");
		assert.ok(result.sessionId, "sessionId returned");
		const state = readSessionStateFromDisk(dir);
		assert.ok(state, "state.json should exist after successful validation");
		assert.equal(state!.session_id, result.sessionId, "session ID matches");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("verify source code ordering: writeSessionState is after validateCompliance in loader.ts", () => {
	const content = readFileSync(join(__dirname, "..", "src", "loader.ts"), "utf-8");
	const validateIdx = content.indexOf("validateCompliance(manifest)");
	const writeIdx = content.indexOf("writeSessionState(gitagentDir)");
	assert.ok(validateIdx >= 0, "validateCompliance must exist in loader.ts");
	assert.ok(writeIdx >= 0, "writeSessionState must exist in loader.ts");
	assert.ok(
		writeIdx > validateIdx,
		"writeSessionState must be called AFTER validateCompliance in loader.ts",
	);
});

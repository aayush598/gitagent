import { execFileSync } from "child_process";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { resolve, join } from "path";
import { randomBytes } from "crypto";

// ── Types ─────────────────────────────────────────────────────────────

export interface LocalRepoOptions {
	url: string;
	token: string;
	dir: string;
	session?: string;
}

export interface LocalSession {
	dir: string;
	branch: string;
	sessionId: string;
	commitChanges(msg?: string): void;
	push(): void;
	finalize(): void;
}

// ── Helpers ───────────────────────────────────────────────────────────

function setupCredentialHelper(dir: string, url: string, token: string): void {
	const host = new URL(url).host;
	const credentialsPath = join(dir, ".git", ".git-credentials");
	writeFileSync(credentialsPath, `https://oauth2:${token}@${host}\n`, "utf-8");
	execFileSync("chmod", ["600", credentialsPath], { stdio: "pipe" });
	execFileSync("git", ["config", "--local", "credential.helper", `store --file ${credentialsPath}`], { cwd: dir, stdio: "pipe" });
}

function git(args: string[], cwd: string): string {
	return execFileSync("git", args, { cwd, stdio: "pipe", encoding: "utf-8" }).trim();
}

function getDefaultBranch(cwd: string): string {
	try {
		// e.g. "origin/main" → "main"
		const ref = git(["symbolic-ref", "refs/remotes/origin/HEAD"], cwd);
		return ref.replace("refs/remotes/origin/", "");
	} catch {
		// Fallback: try main, then master
		try {
			git(["rev-parse", "--verify", "origin/main"], cwd);
			return "main";
		} catch {
			return "master";
		}
	}
}

function cleanupOnExit(dir: string, url: string, credentialsPath: string): void {
	process.on("exit", () => {
		try {
			execFileSync("git", ["remote", "set-url", "origin", url], { cwd: dir, stdio: "pipe", encoding: "utf-8" });
		} catch { /* best effort */ }
		try {
			execFileSync("rm", ["-f", credentialsPath], { stdio: "pipe" });
		} catch { /* best effort */ }
	});
}

// ── initLocalSession ──────────────────────────────────────────────────

export function initLocalSession(opts: LocalRepoOptions): LocalSession {
	const { url, token, session } = opts;
	const dir = resolve(opts.dir);

	// Clone or init repository without embedding token in the URL
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
		git(["init"], dir);
		git(["remote", "add", "origin", url], dir);
	} else {
		git(["remote", "set-url", "origin", url], dir);
	}

	// Set up credential helper before any authenticated operation
	setupCredentialHelper(dir, url, token);

	if (!existsSync(join(dir, ".git", "HEAD")) || existsSync(join(dir, ".git", "shallow"))) {
		// Fresh clone: fetch all branches shallowly
		git(["fetch", "--depth", "1", "--no-single-branch", "origin"], dir);
	} else {
		git(["fetch", "origin"], dir);
	}

	// Ensure remote URL is clean — no token embedded
	git(["remote", "set-url", "origin", url], dir);

	// Reset local default branch to latest remote
	const defaultBranch = getDefaultBranch(dir);
	git(["checkout", "-B", defaultBranch, `origin/${defaultBranch}`], dir);
	git(["reset", "--hard", `origin/${defaultBranch}`], dir);

	// Determine branch
	let branch: string;
	let sessionId: string;

	if (session) {
		// Resume existing session
		branch = session;
		sessionId = branch.replace(/^gitclaw\/session-/, "") || branch;

		// Try local checkout first, fall back to remote tracking
		try {
			git(["checkout", branch], dir);
		} catch {
			git(["checkout", "-b", branch, `origin/${branch}`], dir);
		}
		// Pull latest for existing session branch
		try { git(["pull", "origin", branch], dir); } catch { /* branch may not exist on remote yet */ }
	} else {
		// New session — branch off latest default branch
		sessionId = randomBytes(4).toString("hex"); // 8-char hex
		branch = `gitclaw/session-${sessionId}`;
		git(["checkout", "-b", branch], dir);
	}

	// Scaffold agent.yaml + memory (on session branch only)
	const agentYamlPath = `${dir}/agent.yaml`;
	if (!existsSync(agentYamlPath)) {
		const name = url.split("/").pop()?.replace(/\.git$/, "") || "agent";
		writeFileSync(agentYamlPath, [
			'spec_version: "0.1.0"',
			`name: ${name}`,
			"version: 0.1.0",
			`description: Gitclaw agent for ${name}`,
			"model:",
			'  preferred: "openai:gpt-4o-mini"',
			"  fallback: []",
			"tools: [cli, read, write, memory]",
			"runtime:",
			"  max_turns: 50",
			"",
		].join("\n"), "utf-8");
	}

	const memoryFile = `${dir}/memory/MEMORY.md`;
	if (!existsSync(memoryFile)) {
		mkdirSync(`${dir}/memory`, { recursive: true });
		writeFileSync(memoryFile, "# Memory\n", "utf-8");
	}

	// Register process exit cleanup to remove credential file and strip URL
	const credentialsPath = join(dir, ".git", ".git-credentials");
	cleanupOnExit(dir, url, credentialsPath);

	// Build session object
	const localSession: LocalSession = {
		dir,
		branch,
		sessionId,

		commitChanges(msg?: string) {
			git(["add", "-A"], dir);
			try {
				git(["diff", "--cached", "--quiet"], dir);
				// Nothing staged — skip
			} catch {
				// There are staged changes
				const commitMsg = msg || `gitclaw: auto-commit (${branch})`;
				git(["commit", "-m", commitMsg], dir);
			}
		},

		push() {
			git(["push", "origin", branch], dir);
		},

		finalize() {
			localSession.commitChanges();
			localSession.push();
			// Remove credential file and keep plain URL
			try { execFileSync("rm", ["-f", credentialsPath], { stdio: "pipe" }); } catch { /* best effort */ }
			git(["remote", "set-url", "origin", url], dir);
			// Remove cleanup handler since we've already cleaned up
			process.removeAllListeners("exit");
		},
	};

	return localSession;
}

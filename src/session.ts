import { execFile } from "child_process";
import { access, mkdir, writeFile } from "fs/promises";
import { resolve } from "path";
import { randomBytes } from "crypto";
import { promisify } from "util";

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
	commitChanges(msg?: string): Promise<void>;
	push(): Promise<void>;
	finalize(): Promise<void>;
}

// ── Helpers ───────────────────────────────────────────────────────────

const execFileAsync = promisify(execFile);

async function execGit(args: string[], cwd: string): Promise<string> {
	const { stdout } = await execFileAsync("git", args, { cwd, encoding: "utf-8" });
	return stdout.trim();
}

async function fileExists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

function authedUrl(url: string, token: string): string {
	return url.replace(/^https:\/\//, `https://${token}@`);
}

function cleanUrl(url: string): string {
	return url.replace(/^https:\/\/[^@]+@/, "https://");
}

async function git(args: string, cwd: string): Promise<string> {
	return execGit(args.split(/\s+/), cwd);
}

async function getDefaultBranch(cwd: string): Promise<string> {
	try {
		const ref = await git("symbolic-ref refs/remotes/origin/HEAD", cwd);
		return ref.replace("refs/remotes/origin/", "");
	} catch {
		try {
			await git("rev-parse --verify origin/main", cwd);
			return "main";
		} catch {
			return "master";
		}
	}
}

// ── initLocalSession ──────────────────────────────────────────────────

export async function initLocalSession(opts: LocalRepoOptions): Promise<LocalSession> {
	const { url, token, session } = opts;
	const dir = resolve(opts.dir);
	const aUrl = authedUrl(url, token);

	if (!(await fileExists(dir))) {
		await execGit(["clone", "--depth", "1", "--no-single-branch", aUrl, dir], dir);
	} else {
		await git(`remote set-url origin ${aUrl}`, dir);
		await git("fetch origin", dir);

		const defaultBranch = await getDefaultBranch(dir);
		await git(`checkout ${defaultBranch}`, dir);
		await git(`reset --hard origin/${defaultBranch}`, dir);
	}

	let branch: string;
	let sessionId: string;

	if (session) {
		branch = session;
		sessionId = branch.replace(/^gitclaw\/session-/, "") || branch;

		try {
			await git(`checkout ${branch}`, dir);
		} catch {
			await git(`checkout -b ${branch} origin/${branch}`, dir);
		}
		try { await git(`pull origin ${branch}`, dir); } catch { /* ok */ }
	} else {
		sessionId = randomBytes(4).toString("hex");
		branch = `gitclaw/session-${sessionId}`;
		await git(`checkout -b ${branch}`, dir);
	}

	const agentYamlPath = resolve(dir, "agent.yaml");
	if (!(await fileExists(agentYamlPath))) {
		const name = url.split("/").pop()?.replace(/\.git$/, "") || "agent";
		await writeFile(agentYamlPath, [
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

	const memoryDir = resolve(dir, "memory");
	const memoryFile = resolve(memoryDir, "MEMORY.md");
	if (!(await fileExists(memoryFile))) {
		await mkdir(memoryDir, { recursive: true });
		await writeFile(memoryFile, "# Memory\n", "utf-8");
	}

	const localSession: LocalSession = {
		dir,
		branch,
		sessionId,

		async commitChanges(msg?: string) {
			await git("add -A", dir);
			try {
				await git("diff --cached --quiet", dir);
			} catch {
				const commitMsg = msg || `gitclaw: auto-commit (${branch})`;
				await execGit(["commit", "-m", commitMsg], dir);
			}
		},

		async push() {
			await git(`push origin ${branch}`, dir);
		},

		async finalize() {
			await this.commitChanges();
			await this.push();
			await git(`remote set-url origin ${cleanUrl(url)}`, dir);
		},
	};

	return localSession;
}

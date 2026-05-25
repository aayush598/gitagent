import { Type } from "@sinclair/typebox";
import { homedir } from "os";
import { resolve, relative } from "path";
import { realpathSync } from "fs";
import { open, readFile as fsReadFile, writeFile as fsWriteFile } from "fs/promises";

// ── Constants ───────────────────────────────────────────────────────────

export const MAX_OUTPUT = 100_000; // ~100KB max output to send to LLM
export const MAX_LINES = 2000;
export const MAX_BYTES = 100_000;
export const DEFAULT_TIMEOUT = 120;
export const DEFAULT_MEMORY_PATH = "memory/MEMORY.md";

// ── Schemas ─────────────────────────────────────────────────────────────

export const cliSchema = Type.Object({
	command: Type.String({ description: "Shell command to execute" }),
	timeout: Type.Optional(Type.Number({ description: "Timeout in seconds (default: 120)" })),
});

export const readSchema = Type.Object({
	path: Type.String({ description: "File path relative to the working directory. Cannot use absolute paths or ../ traversal." }),
	offset: Type.Optional(Type.Number({ description: "Line number to start from (1-indexed)" })),
	limit: Type.Optional(Type.Number({ description: "Maximum number of lines to read" })),
});

export const writeSchema = Type.Object({
	path: Type.String({ description: "File path relative to the working directory. Cannot use absolute paths or ../ traversal." }),
	content: Type.String({ description: "Content to write to the file" }),
	createDirs: Type.Optional(Type.Boolean({ description: "Create parent directories if needed (default: true)" })),
});

export const editSchema = Type.Object({
	path: Type.String({ description: "File path relative to the working directory. Cannot use absolute paths or ../ traversal." }),
	old_string: Type.String({ description: "Exact text to find and replace. Must match uniquely unless replace_all is true." }),
	new_string: Type.String({ description: "Replacement text" }),
	replace_all: Type.Optional(Type.Boolean({ description: "Replace every occurrence (default: false)" })),
	regex: Type.Optional(Type.Boolean({ description: "Treat old_string as a JavaScript regular expression (default: false). When true, new_string may reference groups like $1." })),
	flags: Type.Optional(Type.String({ description: "Regex flags (e.g. 'i', 'm', 's'). Only used when regex=true. 'g' is added automatically when replace_all is true." })),
});

export const memorySchema = Type.Object({
	action: Type.Union([Type.Literal("load"), Type.Literal("save")], { description: "Whether to load or save memory" }),
	content: Type.Optional(Type.String({ description: "Memory content to save (required for save)" })),
	message: Type.Optional(Type.String({ description: "Commit message describing why this memory changed (required for save)" })),
});

export const taskTrackerSchema = Type.Object({
	action: Type.Union([Type.Literal("begin"), Type.Literal("update"), Type.Literal("end"), Type.Literal("list")], { description: "Action to perform" }),
	objective: Type.Optional(Type.String({ description: "Task objective (required for begin)" })),
	task_id: Type.Optional(Type.String({ description: "Task ID (required for update/end)" })),
	step: Type.Optional(Type.String({ description: "Step description (for update)" })),
	outcome: Type.Optional(Type.Union([Type.Literal("success"), Type.Literal("failure"), Type.Literal("partial")], { description: "Task outcome (for end)" })),
	failure_reason: Type.Optional(Type.String({ description: "Why the task failed (for end+failure)" })),
	skill_used: Type.Optional(Type.String({ description: "Name of skill used, if any (for end)" })),
});

export const capturePhotoSchema = Type.Object({
	reason: Type.String({ description: "Why this moment is being captured (e.g. 'user celebrating project launch')" }),
});

export const skillLearnerSchema = Type.Object({
	action: Type.Union([Type.Literal("evaluate"), Type.Literal("crystallize"), Type.Literal("status"), Type.Literal("review"), Type.Literal("update"), Type.Literal("delete")], { description: "Action to perform" }),
	task_id: Type.Optional(Type.String({ description: "Task ID (for evaluate/crystallize)" })),
	skill_name: Type.Optional(Type.String({ description: "Skill name (for crystallize/update/delete)" })),
	skill_description: Type.Optional(Type.String({ description: "Skill description (for crystallize)" })),
	instructions: Type.Optional(Type.String({ description: "New instructions content (for update)" })),
	override_heuristic: Type.Optional(Type.Boolean({ description: "Override skill-worthiness heuristic (for evaluate)" })),
});

// ── Shared helpers ──────────────────────────────────────────────────────

/** Truncate output to MAX_OUTPUT, keeping the tail. */
export function truncateOutput(text: string): string {
	if (text.length > MAX_OUTPUT) {
		return `[output truncated, showing last ~100KB]\n${text.slice(-MAX_OUTPUT)}`;
	}
	return text;
}

/**
 * Paginate text by lines with offset (1-indexed) and limit.
 * Returns { text, hasMore, shownRange, totalLines }.
 */
export function paginateLines(
	text: string,
	offset?: number,
	limit?: number,
): { text: string; hasMore: boolean; shownRange: [number, number]; totalLines: number } {
	const allLines = text.split("\n");
	const totalLines = allLines.length;

	const startLine = offset ? Math.max(0, offset - 1) : 0;
	if (startLine >= totalLines) {
		throw new Error(`Offset ${offset} is beyond end of file (${totalLines} lines)`);
	}

	const maxLines = limit ?? MAX_LINES;
	const endLine = Math.min(startLine + maxLines, totalLines);
	let selected = allLines.slice(startLine, endLine).join("\n");

	let truncatedByBytes = false;
	if (Buffer.byteLength(selected, "utf-8") > MAX_BYTES) {
		selected = selected.slice(0, MAX_BYTES);
		truncatedByBytes = true;
	}

	const hasMore = endLine < totalLines || truncatedByBytes;

	return {
		text: selected,
		hasMore,
		shownRange: [startLine + 1, endLine],
		totalLines,
	};
}

/**
 * Safely resolve a path and verify it stays within the allowed base directory.
 * Rejects absolute paths and ../ traversal that escape the working directory.
 * Resolves symlinks via realpathSync to prevent symlink-based traversal.
 */
export function resolveSafePath(path: string, cwd: string): string {
	if (!path || !path.trim()) {
		throw new Error("Path cannot be empty");
	}

	if (path.includes("\0")) {
		throw new Error("Path contains null byte — possible injection attempt");
	}

	if (path.startsWith("~/") || path === "~") {
		path = homedir() + path.slice(1);
	}

	const resolved = path.startsWith("/") ? path : resolve(cwd, path);

	// Reject absolute paths (including after ~ expansion) immediately.
	// Also reject paths that logically escape cwd before symlink resolution
	// (catches cases where resolved normalizes outside cwd but target doesn't exist).
	if (path.startsWith("/") || relative(resolve(cwd), resolved).startsWith("..")) {
		throw new Error(
			`Path traversal detected: "${path}" resolves outside the working directory. ` +
			`Use paths relative to the workspace: ${cwd}`,
		);
	}

	// Resolve the allowed base through realpathSync to handle symlinked cwd.
	let allowedBase = resolve(cwd);
	try {
		allowedBase = realpathSync(allowedBase);
	} catch {
		// allowedBase doesn't exist yet — keep the normalized path
	}

	// Resolve symlinks to prevent symlink-based path traversal.
	// If the resolved path doesn't exist yet (e.g., for write operations),
	// resolve symlinks along the parent chain by walking from allowedBase.
	let realResolved: string;
	try {
		realResolved = realpathSync(resolved);
	} catch {
		// Path doesn't exist — walk up from allowedBase, resolving each
		// existing component through realpathSync.
		const relPath = relative(allowedBase, resolved);
		const parts = relPath.split("/").filter(Boolean);
		let candidate = allowedBase;
		for (const part of parts) {
			candidate = resolve(candidate, part);
			try {
				candidate = realpathSync(candidate);
			} catch {
				// Component doesn't exist yet (e.g., new file) — keep going
			}
		}
		realResolved = candidate;
	}

	// Compare real-resolved paths: both allowedBase and realResolved are
	// resolved through symlinks, so the comparison is symlink-aware.
	const realRel = relative(allowedBase, realResolved);
	if (realRel.startsWith("..")) {
		throw new Error(
			`Path traversal detected: "${path}" resolves to "${realResolved}" which is outside the working directory ` +
			`(symlink resolved). Use paths relative to the workspace: ${cwd}`,
		);
	}

	return resolved;
}

/** Resolve a path relative to a sandbox repo root with traversal protection. */
export function resolveSandboxPath(path: string, repoRoot: string): string {
	return resolveSafePath(path, repoRoot);
}

/**
 * Read a file with TOCTOU-safe path validation.
 * Opens the file first, resolves its real path through the fd,
 * verifies it's within the allowed base, then reads the content.
 */
export async function safeReadFile(path: string, cwd: string): Promise<Buffer> {
	if (!path || !path.trim()) throw new Error("Path cannot be empty");

	const absolutePath = resolveSafePath(path, cwd);
	const fd = await open(absolutePath, "r");
	try {
		const realPath = await fd.realpath();
		const allowedBase = resolve(cwd);
		const realRel = relative(allowedBase, realPath);
		if (realRel.startsWith("..")) {
			throw new Error(
				`Path traversal detected: "${path}" resolves to "${realPath}" which is outside the working directory. ` +
				`Use paths relative to the workspace: ${cwd}`,
			);
		}
		return await fd.readFile();
	} finally {
		await fd.close();
	}
}

/**
 * Write a file with TOCTOU-safe path validation.
 * For new files, validates the parent directory's real path.
 * For existing files, opens first and verifies through the fd.
 */
export async function safeWriteFile(path: string, content: string, cwd: string): Promise<void> {
	if (!path || !path.trim()) throw new Error("Path cannot be empty");

	const absolutePath = resolveSafePath(path, cwd);

	// Try to open existing file for writing (fails if doesn't exist)
	try {
		const fd = await open(absolutePath, "r+");
		try {
			const realPath = await fd.realpath();
			const allowedBase = resolve(cwd);
			const realRel = relative(allowedBase, realPath);
			if (realRel.startsWith("..")) {
				throw new Error(
					`Path traversal detected: "${path}" resolves to "${realPath}" which is outside the working directory.`,
				);
			}
			await fd.writeFile(content, "utf-8");
			return;
		} finally {
			await fd.close();
		}
	} catch (err: any) {
		// File doesn't exist yet — write normally (path was already validated by resolveSafePath)
		if (err.code === "ENOENT") {
			await fsWriteFile(absolutePath, content, "utf-8");
			return;
		}
		throw err;
	}
}



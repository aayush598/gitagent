import { Type } from "@sinclair/typebox";
import { homedir } from "os";
import { isIPv4, isIPv6 } from "net";

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
	path: Type.String({ description: "Path to the file to read (relative or absolute)" }),
	offset: Type.Optional(Type.Number({ description: "Line number to start from (1-indexed)" })),
	limit: Type.Optional(Type.Number({ description: "Maximum number of lines to read" })),
});

export const writeSchema = Type.Object({
	path: Type.String({ description: "Path to the file to write (relative or absolute)" }),
	content: Type.String({ description: "Content to write to the file" }),
	createDirs: Type.Optional(Type.Boolean({ description: "Create parent directories if needed (default: true)" })),
});

export const editSchema = Type.Object({
	path: Type.String({ description: "Path to the file to edit (relative or absolute)" }),
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

// ── SSRF prevention ─────────────────────────────────────────────────────

const PRIVATE_IPV4_RANGES = [
	/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
	/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
	/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/,
	/^192\.168\.\d{1,3}\.\d{1,3}$/,
	/^169\.254\.\d{1,3}\.\d{1,3}$/,
	/^0\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
	/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}$/,
];

const BLOCKED_HOSTNAMES = [
	/metadata\.google\.internal/i,
	/metadata\.google\.compute/i,
	/kubernetes\.default\.svc/i,
	/kubernetes\.default/i,
	/\.internal$/i,
	/^internal\./i,
	/^localhost$/i,
];

const DOCKER_SOCKET_PATTERN = /--unix-socket\s+\S*\/docker\.sock/i;

const NETWORK_TOOLS_PATTERN = /(?:^|\s+)(curl|wget|fetch)(?:\s+|$)/i;
const URL_PATTERN = /https?:\/\/[^\s"'`<>]+/gi;

/** Extract hostname from a URL, handling IPv6 bracket notation and user:pass@host. */
function extractHostname(url: string): string | null {
	const match = url.match(/https?:\/\/(?:\[([^\]]+)\]|(?:[^@\s]+@)?([^\/:\s]+))/i);
	if (!match) return null;
	return (match[1] || match[2]).toLowerCase();
}

export function checkSSRF(command: string): void {
	const trimmed = command.trim();

	// Block Docker socket access via --unix-socket flag
	if (DOCKER_SOCKET_PATTERN.test(trimmed)) {
		throw new Error("Command blocked (SSRF prevention): Docker socket access via --unix-socket is not allowed");
	}

	// Only check commands that make network requests
	if (!NETWORK_TOOLS_PATTERN.test(trimmed)) return;

	const urls = trimmed.match(URL_PATTERN);
	if (!urls) return;

	for (const url of urls) {
		const hostname = extractHostname(url);
		if (!hostname) continue;

		// Check blocked hostnames
		for (const pattern of BLOCKED_HOSTNAMES) {
			if (pattern.test(hostname)) {
				throw new Error(`Command blocked (SSRF prevention): hostname "${hostname}" is not allowed`);
			}
		}

		// Strip brackets from IPv6 for isIPv6 check
		const cleanHostname = hostname.replace(/^\[|\]$/g, "");

		if (isIPv4(cleanHostname)) {
			for (const range of PRIVATE_IPV4_RANGES) {
				if (range.test(cleanHostname)) {
					throw new Error(`Command blocked (SSRF prevention): private IP "${cleanHostname}" is not allowed`);
				}
			}
		}

		if (isIPv6(cleanHostname)) {
			const h = cleanHostname.toLowerCase();
			const isPrivate =
				h === "::1" ||
				h === "0:0:0:0:0:0:0:1" ||
				h.startsWith("fc") ||
				h.startsWith("fd") ||
				h.startsWith("fe80") ||
				h === "::" ||
				h === "0:0:0:0:0:0:0:0";
			if (isPrivate) {
				throw new Error(`Command blocked (SSRF prevention): private IPv6 address "${cleanHostname}" is not allowed`);
			}
		}
	}
}

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

/** Resolve a path relative to a sandbox repo root. */
export function resolveSandboxPath(path: string, repoRoot: string): string {
	if (path.startsWith("~/") || path === "~") {
		path = homedir() + path.slice(1);
	}
	if (path.startsWith("/")) return path;
	return repoRoot.endsWith("/") ? repoRoot + path : repoRoot + "/" + path;
}

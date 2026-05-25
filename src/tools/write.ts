import { mkdir, writeFile } from "fs/promises";
import { dirname, resolve } from "path";
import { homedir } from "os";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { writeSchema } from "./shared.js";

const PROTECTED_FILES = ["SOUL.md", "RULES.md", "DUTIES.md", "AGENTS.md"];

function resolvePath(path: string, cwd: string): string {
	if (path.startsWith("~/") || path === "~") {
		path = homedir() + path.slice(1);
	}
	return path.startsWith("/") ? path : resolve(cwd, path);
}

function basename(p: string): string {
	const idx = p.lastIndexOf("/");
	return idx === -1 ? p : p.slice(idx + 1);
}

function isProtectedFile(absolutePath: string, cwd: string): boolean {
	const name = basename(absolutePath);
	if (!PROTECTED_FILES.includes(name)) return false;
	// Only protect files directly in the agent directory
	return dirname(absolutePath) === cwd;
}

export function createWriteTool(cwd: string): AgentTool<typeof writeSchema> {
	return {
		name: "write",
		label: "write",
		description: "Write content to a file. Creates the file if it doesn't exist, overwrites if it does. Parent directories are created automatically.",
		parameters: writeSchema,
		execute: async (
			_toolCallId: string,
			{ path, content, createDirs }: { path: string; content: string; createDirs?: boolean },
			signal?: AbortSignal,
		) => {
			if (signal?.aborted) throw new Error("Operation aborted");

			const absolutePath = resolvePath(path, cwd);

			if (isProtectedFile(absolutePath, cwd)) {
				return {
					content: [{ type: "text", text: `Cannot write to protected file: ${basename(absolutePath)}. This file controls agent behavior.` }],
					details: undefined,
				};
			}

			if (createDirs !== false) {
				await mkdir(dirname(absolutePath), { recursive: true });
			}

			await writeFile(absolutePath, content, "utf-8");

			const bytes = Buffer.byteLength(content, "utf-8");
			return {
				content: [{ type: "text", text: `Wrote ${bytes} bytes to ${path}` }],
				details: undefined,
			};
		},
	};
}

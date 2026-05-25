import { mkdir } from "fs/promises";
import { dirname } from "path";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { writeSchema, safeWriteFile, resolveSafePath, assertNotSymlink } from "./shared.js";

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

			if (createDirs !== false) {
				const dirPath = dirname(path);
				if (dirPath && dirPath !== ".") {
					const resolvedDir = resolveSafePath(dirPath, cwd);
					await assertNotSymlink(resolvedDir);
					await mkdir(resolvedDir, { recursive: true });
				}
			}

			await assertNotSymlink(resolveSafePath(path, cwd));
			await safeWriteFile(path, content, cwd);

			const bytes = Buffer.byteLength(content, "utf-8");
			return {
				content: [{ type: "text", text: `Wrote ${bytes} bytes to ${path}` }],
				details: undefined,
			};
		},
	};
}

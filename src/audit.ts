import { appendFile, mkdir, rename, stat, unlink } from "fs/promises";
import { join, dirname, basename } from "path";
import { createGzip } from "zlib";
import { createReadStream, createWriteStream, existsSync } from "fs";
import { pipeline } from "stream/promises";
import type { HooksConfig } from "./hooks.js";

export interface AuditEntry {
	timestamp: string;
	session_id: string;
	event: string;
	tool?: string;
	args?: Record<string, any>;
	result?: string;
	error?: string;
	[key: string]: any;
}

const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_ROTATED_FILES = 5;

export class AuditLogger {
	private logPath: string;
	private sessionId: string;
	private enabled: boolean;

	constructor(gitagentDir: string, sessionId: string, enabled: boolean) {
		this.logPath = join(gitagentDir, "audit.jsonl");
		this.sessionId = sessionId;
		this.enabled = enabled;
	}

	private async rotateIfNeeded(): Promise<void> {
		try {
			const s = await stat(this.logPath);
			if (s.size < MAX_LOG_SIZE) return;
		} catch {
			return;
		}

		try {
			const dir = dirname(this.logPath);
			const base = basename(this.logPath);

			for (let i = MAX_ROTATED_FILES - 1; i >= 1; i--) {
				const oldPath = join(dir, `${base}.${i}.gz`);
				const newPath = join(dir, `${base}.${i + 1}.gz`);
				if (existsSync(oldPath)) {
					await rename(oldPath, newPath).catch(() => {});
				}
			}

			const tempPath = join(dir, `${base}.rot`);
			await rename(this.logPath, tempPath).catch(() => {});

			const gzPath = join(dir, `${base}.1.gz`);
			const readStream = createReadStream(tempPath);
			const writeStream = createWriteStream(gzPath);
			const gzipStream = createGzip();
			await pipeline(readStream, gzipStream, writeStream);
			await unlink(tempPath).catch(() => {});
		} catch (err: any) {
			console.error(`[audit] Log rotation failed: ${err.message}`);
		}
	}

	async log(event: string, data: Partial<AuditEntry> = {}): Promise<void> {
		if (!this.enabled) return;

		const entry: AuditEntry = {
			timestamp: new Date().toISOString(),
			session_id: this.sessionId,
			event,
			...data,
		};

		try {
			await mkdir(dirname(this.logPath), { recursive: true });
			await this.rotateIfNeeded();
			await appendFile(this.logPath, JSON.stringify(entry) + "\n", "utf-8");
		} catch (err: any) {
			console.error(`[audit] Write failed: ${err.message}`);
		}
	}

	async logToolUse(tool: string, args: Record<string, any>): Promise<void> {
		await this.log("tool_use", { tool, args });
	}

	async logToolResult(tool: string, result: string): Promise<void> {
		await this.log("tool_result", { tool, result: result.slice(0, 1000) });
	}

	async logResponse(): Promise<void> {
		await this.log("response");
	}

	async logError(error: string): Promise<void> {
		await this.log("error", { error });
	}

	async logSessionStart(): Promise<void> {
		await this.log("session_start");
	}

	async logSessionEnd(): Promise<void> {
		await this.log("session_end");
	}
}

/**
 * Check if audit logging is enabled via compliance config.
 */
export function isAuditEnabled(compliance?: Record<string, any>): boolean {
	if (!compliance) return false;
	return compliance.recordkeeping?.audit_logging === true;
}

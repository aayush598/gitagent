import type { AgentTool } from "@mariozechner/pi-agent-core";

interface RateLimitConfig {
	maxCalls: number;
	windowMs: number;
}

const DEFAULT_LIMITS: Record<string, RateLimitConfig> = {
	cli: { maxCalls: 10, windowMs: 60000 },
	write: { maxCalls: 30, windowMs: 60000 },
	read: { maxCalls: 60, windowMs: 60000 },
	edit: { maxCalls: 30, windowMs: 60000 },
	memory: { maxCalls: 20, windowMs: 60000 },
	task_tracker: { maxCalls: 30, windowMs: 60000 },
	skill_learner: { maxCalls: 10, windowMs: 60000 },
	capture_photo: { maxCalls: 10, windowMs: 60000 },
	sandbox_cli: { maxCalls: 10, windowMs: 60000 },
	sandbox_write: { maxCalls: 30, windowMs: 60000 },
	sandbox_read: { maxCalls: 60, windowMs: 60000 },
	sandbox_edit: { maxCalls: 30, windowMs: 60000 },
	sandbox_memory: { maxCalls: 20, windowMs: 60000 },
};

export class RateLimiter {
	private windows = new Map<string, number[]>();

	check(toolName: string): void {
		const config = DEFAULT_LIMITS[toolName];
		if (!config) return;

		const now = Date.now();
		let calls = this.windows.get(toolName) || [];

		calls = calls.filter(t => now - t < config.windowMs);

		if (calls.length >= config.maxCalls) {
			const oldest = calls[0];
			const retryAfter = Math.ceil((oldest + config.windowMs - now) / 1000);
			throw new Error(
				`Rate limit exceeded for "${toolName}". ` +
				`Max ${config.maxCalls} calls per ${config.windowMs / 1000}s. ` +
				`Retry in ${retryAfter}s.`
			);
		}

		calls.push(now);
		this.windows.set(toolName, calls);
	}

	reset(toolName?: string): void {
		if (toolName) {
			this.windows.delete(toolName);
		} else {
			this.windows.clear();
		}
	}
}

export const rateLimiter = new RateLimiter();

export function wrapToolWithRateLimit<T extends AgentTool<any>>(tool: T): T {
	const originalExecute = tool.execute;

	const wrapped = {
		...tool,
		execute: async (
			toolCallId: string,
			args: any,
			signal?: AbortSignal,
			onUpdate?: any,
		) => {
			rateLimiter.check(tool.name);
			return originalExecute.call(tool, toolCallId, args, signal, onUpdate);
		},
	};

	return wrapped as T;
}

import cron, { type ScheduledTask } from "node-cron";
import { discoverSchedules, updateScheduleMeta, type ScheduleDefinition } from "./schedules.js";
import { mkdirSync, appendFileSync } from "fs";
import { join } from "path";
import type { ServerMessage } from "./voice/adapter.js";

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

export interface SchedulerOptions {
	agentDir: string;
	model?: string;
	env?: string;
	runPrompt: (prompt: string) => Promise<string>;
	broadcastToBrowsers: (msg: ServerMessage) => void;
	appendToHistory: (msg: any) => void;
}

const activeTasks = new Map<string, ScheduledTask>();
const activeTimers = new Map<string, ReturnType<typeof setTimeout>>();
const runningJobs = new Set<string>();

const CRON_ALIASES: Record<string, string> = {
	"@hourly": "0 * * * *",
	"@daily": "0 0 * * *",
	"@weekly": "0 0 * * 0",
	"@monthly": "0 0 1 * *",
	"@yearly": "0 0 1 1 *",
	"@annually": "0 0 1 1 *",
};

function expandCronAliases(expr: string): string {
	const lower = expr.trim().toLowerCase();
	if (CRON_ALIASES[lower]) return CRON_ALIASES[lower];

	const everyMatch = lower.match(/^@every\s+(\d+)\s*(s|sec|seconds?|m|min|minutes?|h|hr|hours?)$/);
	if (everyMatch) {
		const value = parseInt(everyMatch[1], 10);
		const unit = everyMatch[2][0];
		if (unit === "s") return `*/${value} * * * * *`;
		if (unit === "m") return `*/${value} * * * *`;
		if (unit === "h") return `0 */${value} * * *`;
	}

	return expr;
}

export async function startScheduler(opts: SchedulerOptions): Promise<void> {
	const schedules = await discoverSchedules(opts.agentDir);
	let activeCount = 0;

	for (const schedule of schedules) {
		if (!schedule.enabled) continue;

		let cronExpr = schedule.cron ? expandCronAliases(schedule.cron) : undefined;

		if (schedule.mode === "once" && schedule.runAt) {
			const delay = new Date(schedule.runAt).getTime() - Date.now();
			if (delay <= 0) {
				console.log(dim(`[scheduler] "${schedule.id}" runAt is in the past - skipping`));
				continue;
			}
			const timer = setTimeout(() => {
				executeScheduledJob(schedule, opts, true);
			}, delay);
			activeTimers.set(schedule.id, timer);
			const when = new Date(schedule.runAt).toLocaleString();
			console.log(dim(`[scheduler] "${schedule.id}" scheduled once at ${when} (in ${Math.round(delay / 1000)}s)`));
			activeCount++;
		} else if (schedule.mode === "once" && cronExpr) {
			if (!cron.validate(cronExpr)) {
				console.log(dim(`[scheduler] Invalid cron for "${schedule.id}": ${cronExpr} — skipping`));
				continue;
			}
			const task = cron.schedule(cronExpr, () => {
				executeScheduledJob(schedule, opts, true);
			});
			activeTasks.set(schedule.id, task);
			activeCount++;
		} else if (cronExpr) {
			if (!cron.validate(cronExpr)) {
				console.log(dim(`[scheduler] Invalid cron for "${schedule.id}": ${cronExpr} — skipping`));
				continue;
			}
			const task = cron.schedule(cronExpr, () => {
				executeScheduledJob(schedule, opts, false);
			});
			activeTasks.set(schedule.id, task);
			activeCount++;
		}
	}

	console.log(dim(`[scheduler] Loaded ${schedules.length} schedules (${activeCount} active)`));
}

export function stopScheduler(): void {
	for (const [, task] of activeTasks) {
		task.stop();
	}
	activeTasks.clear();
	for (const [, timer] of activeTimers) {
		clearTimeout(timer);
	}
	activeTimers.clear();
	console.log(dim("[scheduler] Stopped all scheduled tasks"));
}

export async function reloadSchedules(opts: SchedulerOptions): Promise<void> {
	stopScheduler();
	await startScheduler(opts);
}

export async function executeScheduledJob(schedule: ScheduleDefinition, opts: SchedulerOptions, disableAfterRun = false): Promise<void> {
	if (runningJobs.has(schedule.id)) {
		console.log(dim(`[scheduler] Skipping "${schedule.id}" — already running`));
		return;
	}
	runningJobs.add(schedule.id);
	const ts = new Date().toISOString();
	console.log(dim(`[scheduler] Running "${schedule.id}" at ${ts}`));

	// Broadcast schedule start to chat
	const startMsg = { type: "schedule_start", id: schedule.id, prompt: schedule.prompt, ts } as any;
	opts.broadcastToBrowsers(startMsg as ServerMessage);
	opts.appendToHistory(startMsg);

	let result = "";
	let success = true;

	try {
		result = await opts.runPrompt(schedule.prompt);
	} catch (err: any) {
		result = err.message || "Unknown error";
		success = false;
	}

	// Write to JSONL log
	try {
		const logDir = join(opts.agentDir, ".gitagent", "schedule-logs");
		mkdirSync(logDir, { recursive: true });
		const logFile = join(logDir, `${schedule.id}.jsonl`);
		const logEntry = JSON.stringify({ ts, success, result: result.slice(0, 5000) }) + "\n";
		appendFileSync(logFile, logEntry, "utf-8");
	} catch {
		// Log write failure is non-fatal
	}

	// Update schedule metadata (and auto-disable for "once" mode)
	try {
		await updateScheduleMeta(opts.agentDir, schedule.id, {
			lastRunAt: ts,
			lastResult: success ? "success" : "error",
			...(disableAfterRun ? { enabled: false } : {}),
		});
	} catch {
		// Meta update failure is non-fatal
	}

	// Stop the cron task / clear timer if this was a one-time job
	if (disableAfterRun) {
		const task = activeTasks.get(schedule.id);
		if (task) { task.stop(); activeTasks.delete(schedule.id); }
		const timer = activeTimers.get(schedule.id);
		if (timer) { clearTimeout(timer); activeTimers.delete(schedule.id); }
		console.log(dim(`[scheduler] "${schedule.id}" auto-disabled (run-once)`));
	}

	// Broadcast to connected browsers and persist to chat history
	const endMsg = {
		type: "schedule_result",
		id: schedule.id,
		result: result.slice(0, 2000),
		success,
		ts,
	} as any;
	opts.broadcastToBrowsers(endMsg as ServerMessage);
	opts.appendToHistory(endMsg);

	runningJobs.delete(schedule.id);
	console.log(dim(`[scheduler] "${schedule.id}" completed (${success ? "success" : "error"})`));
}

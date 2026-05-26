import { describe, it } from "node:test";
import assert from "node:assert/strict";

interface TaskRecord {
	id: string;
	objective: string;
	steps: { description: string; timestamp: string }[];
	attempts: number;
	status: "active" | "succeeded" | "failed";
	outcome?: "success" | "failure" | "partial";
	failure_reason?: string;
	skill_used?: string;
	started_at: string;
	ended_at?: string;
}

interface TasksStore {
	tasks: TaskRecord[];
}

function loadTasks(raw: string): TasksStore {
	try {
		if (!raw || !raw.trim()) return { tasks: [] };
		return JSON.parse(raw) as TasksStore;
	} catch {
		return { tasks: [] };
	}
}

describe("BUG-005: JSON parse empty task file", () => {
	it("returns empty tasks for empty string", () => {
		const result = loadTasks("");
		assert.deepEqual(result, { tasks: [] });
	});

	it("returns empty tasks for whitespace-only string", () => {
		const result = loadTasks("   \n\n  \t  ");
		assert.deepEqual(result, { tasks: [] });
	});

	it("parses valid JSON correctly", () => {
		const data: TasksStore = {
			tasks: [{ id: "abc", objective: "test", steps: [], attempts: 1, status: "active", started_at: "2024-01-01" }],
		};
		const result = loadTasks(JSON.stringify(data));
		assert.equal(result.tasks.length, 1);
		assert.equal(result.tasks[0].id, "abc");
	});

	it("returns empty tasks for malformed JSON", () => {
		const result = loadTasks('{"tasks": [{"id": "abc", "objective"');
		assert.deepEqual(result, { tasks: [] });
	});

	it("returns empty tasks for null byte content", () => {
		const result = loadTasks("\0\0\0");
		assert.deepEqual(result, { tasks: [] });
	});

	it("handles valid empty tasks store", () => {
		const result = loadTasks('{"tasks": []}');
		assert.equal(result.tasks.length, 0);
	});
});

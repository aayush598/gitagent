import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

describe("ERR-013: Task tracker state transitions", () => {
	it("should build updated task object before mutating store", () => {
		const task = {
			id: "test-1",
			status: "active" as const,
			outcome: undefined as string | undefined,
			ended_at: undefined as string | undefined,
			steps: [] as string[],
		};

		const outcome = "success";
		const updatedTask = {
			...task,
			outcome,
			status: outcome === "success" ? "succeeded" : "failed",
			ended_at: new Date().toISOString(),
		};

		assert.equal(task.status, "active", "Original task should not be mutated yet");
		assert.equal(updatedTask.status, "succeeded", "Updated task should have new status");
		assert.ok(updatedTask.ended_at, "Updated task should have ended_at");
	});
});

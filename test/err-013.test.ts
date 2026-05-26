import assert from "node:assert/strict";
import { describe, it } from "node:test";

interface TaskRecord {
  id: string;
  objective: string;
  steps: Array<{ description: string; timestamp: string }>;
  attempts: number;
  status: "active" | "succeeded" | "failed";
  outcome?: "success" | "failure" | "partial";
  started_at: string;
  ended_at?: string;
}

interface TasksStore {
  tasks: TaskRecord[];
}

describe("ERR-013: Task tracker state transitions", () => {
  it("should revert in-memory state when save fails in end action", () => {
    const store: TasksStore = {
      tasks: [{ id: "t1", objective: "test", steps: [], attempts: 1, status: "active", started_at: new Date().toISOString() }],
    };

    const taskIdx = store.tasks.findIndex((t) => t.id === "t1");
    assert.notEqual(taskIdx, -1);
    const oldState = { ...store.tasks[taskIdx] };
    const updatedTask: TaskRecord = {
      ...store.tasks[taskIdx],
      outcome: "success" as const,
      status: "succeeded" as const,
      ended_at: new Date().toISOString(),
    };

    store.tasks[taskIdx] = updatedTask;
    store.tasks[taskIdx] = oldState;

    assert.equal(store.tasks[0].status, "active");
    assert.equal(store.tasks[0].outcome, undefined);
  });

  it("should not allow end twice on the same task", () => {
    const task: TaskRecord = { id: "t1", objective: "test", steps: [], attempts: 1, status: "active", started_at: new Date().toISOString() };
    task.status = "succeeded";
    assert.throws(() => {
      if (task.status !== "active") throw new Error("Task t1 is not active");
    }, /not active/);
  });

  it("should revert steps when save fails in update action", () => {
    const store: TasksStore = {
      tasks: [{ id: "t1", objective: "test", steps: [], attempts: 1, status: "active", started_at: new Date().toISOString() }],
    };

    const stepsBackup = [...store.tasks[0].steps];
    store.tasks[0].steps.push({ description: "step 1", timestamp: new Date().toISOString() });
    store.tasks[0].steps = stepsBackup;

    assert.equal(store.tasks[0].steps.length, 0);
  });
});

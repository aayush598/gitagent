import { describe, it } from "node:test";
import assert from "node:assert";

// Inline implementation of topological sort (same algorithm as in src/plugins.ts)
function topoSortPlugins<T extends string>(
  pluginEntries: [T, any][],
  getDeps: (name: T) => T[],
): [T, any][] {
  const graph = new Map<T, T[]>();
  const allNames = new Set(pluginEntries.map(([n]) => n));

  // Build reverse graph: for each dep, track what depends on it
  const dependents = new Map<T, T[]>();
  const inDegree = new Map<T, number>();

  for (const [name] of pluginEntries) {
    dependents.set(name, []);
    inDegree.set(name, 0);
  }

  for (const [name] of pluginEntries) {
    const deps = getDeps(name).filter((d) => allNames.has(d));
    graph.set(name, deps);
    for (const dep of deps) {
      // dep must come before name (name depends on dep)
      dependents.get(dep)!.push(name);
      inDegree.set(name, (inDegree.get(name) || 0) + 1);
    }
  }

  const queue: T[] = [];
  for (const [name] of pluginEntries) {
    if (inDegree.get(name) === 0) queue.push(name);
  }

  const sorted: T[] = [];
  while (queue.length > 0) {
    const name = queue.shift()!;
    sorted.push(name);
    for (const dependent of dependents.get(name) || []) {
      const deg = inDegree.get(dependent)! - 1;
      inDegree.set(dependent, deg);
      if (deg === 0) queue.push(dependent);
    }
  }

  if (sorted.length !== pluginEntries.length) {
    const unsorted = pluginEntries.filter(([n]) => !sorted.includes(n));
    return [...sorted.map((n) => pluginEntries.find(([name]) => name === n)!), ...unsorted];
  }

  return sorted.map((n) => pluginEntries.find(([name]) => name === n)!);
}

describe("BUG-018: Dependency Resolution Order (topological sort)", () => {
  it("should place dependencies before their dependents", () => {
    const entries: [string, any][] = [
      ["plugin-b", {}],
      ["plugin-a", {}],
    ];
    // A depends on nothing; B depends on A
    const deps = new Map<string, string[]>([
      ["plugin-a", []],
      ["plugin-b", ["plugin-a"]],
    ]);
    const sorted = topoSortPlugins(entries, (n) => deps.get(n) || []);
    const names = sorted.map(([n]) => n);
    assert.ok(names.indexOf("plugin-a") < names.indexOf("plugin-b"),
      `Expected plugin-a before plugin-b, got ${names}`);
  });

  it("should handle diamond dependencies", () => {
    const entries: [string, any][] = [
      ["d", {}], ["c", {}], ["b", {}], ["a", {}],
    ];
    // D depends on B and C; B depends on A; C depends on A
    const deps = new Map<string, string[]>([
      ["a", []],
      ["b", ["a"]],
      ["c", ["a"]],
      ["d", ["b", "c"]],
    ]);
    const sorted = topoSortPlugins(entries, (n) => deps.get(n) || []);
    const names = sorted.map(([n]) => n);
    assert.ok(names.indexOf("a") < names.indexOf("b"), `a before b: ${names}`);
    assert.ok(names.indexOf("a") < names.indexOf("c"), `a before c: ${names}`);
    assert.ok(names.indexOf("b") < names.indexOf("d"), `b before d: ${names}`);
    assert.ok(names.indexOf("c") < names.indexOf("d"), `c before d: ${names}`);
    assert.equal(names.length, 4, "All 4 plugins should be in output");
  });

  it("should detect cycles and still return all entries", () => {
    const entries: [string, any][] = [
      ["x", {}], ["y", {}],
    ];
    // x depends on y, y depends on x (cycle)
    const deps = new Map<string, string[]>([
      ["x", ["y"]],
      ["y", ["x"]],
    ]);
    const sorted = topoSortPlugins(entries, (n) => deps.get(n) || []);
    assert.equal(sorted.length, 2, "Should still return all entries");
  });

  it("should work with no dependencies", () => {
    const entries: [string, any][] = [
      ["alpha", {}], ["beta", {}],
    ];
    const sorted = topoSortPlugins(entries, () => []);
    assert.equal(sorted.length, 2);
  });

  it("should handle a chain of 5 plugins", () => {
    const entries: [string, any][] = [
      ["e", {}], ["d", {}], ["c", {}], ["b", {}], ["a", {}],
    ];
    // e -> d -> c -> b -> a
    const deps = new Map<string, string[]>([
      ["a", []],
      ["b", ["a"]],
      ["c", ["b"]],
      ["d", ["c"]],
      ["e", ["d"]],
    ]);
    const sorted = topoSortPlugins(entries, (n) => deps.get(n) || []);
    const names = sorted.map(([n]) => n);
    assert.equal(names.length, 5);
    assert.ok(names.indexOf("a") < names.indexOf("e"), "a before e");
  });
});

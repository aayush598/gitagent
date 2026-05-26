import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface MemoryLayerDef {
	name: string;
	path: string;
	description?: string;
}

interface MemoryLayer {
	name: string;
	path: string;
	max_lines?: number;
	format: "markdown" | "yaml";
}

interface MemoryConfig {
	layers: MemoryLayer[];
	archive_policy?: { max_entries?: number; compress_after?: string };
}

const DEFAULT_MEMORY_PATH = "memory/MEMORY.md";

// Inline the fixed logic from memory.ts
function loadMemoryConfig(rootYamlExists: boolean, rootConfig: Record<string, any> | null, pluginLayers?: MemoryLayerDef[]): MemoryConfig | null {
	let config: MemoryConfig | null = null;

	if (rootConfig) {
		config = {
			layers: Array.isArray(rootConfig.layers) ? rootConfig.layers : [],
			...(rootConfig.archive_policy ? { archive_policy: rootConfig.archive_policy } : {}),
		};
	}

	if (rootYamlExists && pluginLayers && pluginLayers.length > 0) {
		if (!config) config = { layers: [] };
		for (const layer of pluginLayers) {
			if (!config.layers.some(l => l.name === layer.name)) {
				config.layers.push({
					name: layer.name,
					path: layer.path,
					format: "markdown",
				});
			}
		}
	}

	return config;
}

function getWorkingLayer(config: MemoryConfig | null): { path: string } {
	const configLayers = config?.layers ?? [];
	const working = configLayers.find((l) => l.name === "working");
	if (working) {
		return { path: working.path };
	}
	return { path: DEFAULT_MEMORY_PATH };
}

test("no root config and no plugins returns null, getWorkingLayer returns DEFAULT", () => {
	const config = loadMemoryConfig(false, null);
	assert.equal(config, null);
	const { path } = getWorkingLayer(config);
	assert.equal(path, DEFAULT_MEMORY_PATH);
});

test("no root config with plugins does NOT apply plugin layers (root missing)", () => {
	const config = loadMemoryConfig(false, null, [{ name: "tasks", path: "memory/tasks.yaml" }]);
	assert.equal(config, null, "plugins should NOT be applied when root config is missing");
	const { path } = getWorkingLayer(config);
	assert.equal(path, DEFAULT_MEMORY_PATH);
});

test("root config exists but is empty — no layers, no archive_policy", () => {
	const config = loadMemoryConfig(true, {});
	assert.ok(config);
	assert.deepEqual(config!.layers, []);
	const { path } = getWorkingLayer(config);
	assert.equal(path, DEFAULT_MEMORY_PATH);
});

test("root config with layers but no working layer uses DEFAULT_MEMORY_PATH", () => {
	const config = loadMemoryConfig(true, { layers: [{ name: "notes", path: "memory/notes.yaml", format: "markdown" }] });
	assert.ok(config);
	assert.equal(config!.layers.length, 1);
	const { path } = getWorkingLayer(config);
	assert.equal(path, DEFAULT_MEMORY_PATH, "no 'working' layer means default path");
});

test("root config with working layer uses it", () => {
	const config = loadMemoryConfig(true, { layers: [{ name: "working", path: "memory/custom.md", format: "markdown" }] });
	assert.ok(config);
	const { path } = getWorkingLayer(config);
	assert.equal(path, "memory/custom.md");
});

test("root config with archive_policy and no layers preserves archive_policy", () => {
	const config = loadMemoryConfig(true, {
		archive_policy: { max_entries: 1000, compress_after: "90d" },
	});
	assert.ok(config);
	assert.ok(config!.archive_policy);
	assert.equal(config!.archive_policy!.max_entries, 1000);
	assert.equal(config!.archive_policy!.compress_after, "90d");
	assert.deepEqual(config!.layers, []);
});

test("root config with archive_policy and plugin layers preserves archive_policy", () => {
	const config = loadMemoryConfig(true, {
		archive_policy: { max_entries: 500 },
	}, [{ name: "tasks", path: "memory/tasks.yaml" }]);

	assert.ok(config);
	assert.ok(config!.archive_policy);
	assert.equal(config!.archive_policy!.max_entries, 500);
	assert.equal(config!.layers.length, 1);
	assert.equal(config!.layers[0].name, "tasks");
});

test("duplicate plugin layer names are skipped", () => {
	const config = loadMemoryConfig(true, {
		layers: [{ name: "tasks", path: "memory/custom-tasks.yaml", format: "markdown" }],
	}, [{ name: "tasks", path: "memory/plugin-tasks.yaml" }]);

	assert.ok(config);
	assert.equal(config!.layers.length, 1, "duplicate name should be skipped");
	assert.equal(config!.layers[0].path, "memory/custom-tasks.yaml", "original should remain");
});

test("root config with working layer uses it even when plugin layers exist", () => {
	const config = loadMemoryConfig(true, {
		layers: [{ name: "working", path: "memory/main.md", format: "markdown" }],
	}, [{ name: "tasks", path: "memory/tasks.yaml" }]);

	assert.ok(config);
	const { path } = getWorkingLayer(config);
	assert.equal(path, "memory/main.md", "working layer takes priority over plugin layers");
});

test("verify source code: getWorkingLayer now accepts pluginLayers parameter and never defaults to plugin layer", () => {
	const content = readFileSync(join(__dirname, "..", "src", "tools", "memory.ts"), "utf-8");

	// getWorkingLayer should accept pluginLayers
	assert.ok(
		content.includes("getWorkingLayer(config: MemoryConfig | null, pluginLayers?"),
		"getWorkingLayer must accept optional pluginLayers parameter",
	);

	// The old bug pattern: find('working') || config.layers[0] — must NOT exist
	const oldPattern = `.find((l) => l.name === "working") || config.layers[0]`;
	assert.ok(
		!content.includes(oldPattern),
		"Must NOT fall back to config.layers[0] when no 'working' layer found",
	);

	// loadMemoryConfig should check for root config existence
	assert.ok(
		content.includes("rootConfigExists"),
		"loadMemoryConfig must track root config existence",
	);
});

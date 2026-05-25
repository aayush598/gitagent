import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ── Copied from src/plugins.ts ──

const DANGEROUS_YAML_PATTERNS = [
	"!!js/",
	"!!python/",
	"!!ruby/",
	"!!php/",
];

function prevalidateManifest(raw: string): boolean {
	for (const pattern of DANGEROUS_YAML_PATTERNS) {
		if (raw.includes(pattern)) {
			return false;
		}
	}
	return true;
}

// Simulate what yaml.safeLoad would do (since js-yaml is not installed)
// In js-yaml v4+, yaml.load defaults to safe mode
interface PluginManifest {
	id?: string;
	name?: string;
	version?: string;
	description?: string;
	engine?: string;
	entry?: string;
	config?: Record<string, any>;
	provides?: Record<string, any>;
}

function safeParseYaml(raw: string): PluginManifest | null {
	if (!raw.trim()) return null;

	// Simple YAML-like parser for test purposes
	// Only handles flat key-value pairs and basic nesting
	const lines = raw.split("\n");
	const result: Record<string, any> = {};
	const stack: { indent: number; key: string; obj: Record<string, any> }[] = [];
	let current = result;
	let currentIndent = 0;

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;

		const indent = line.search(/\S/);
		if (indent < 0) continue;

		const colonIdx = trimmed.indexOf(":");
		if (colonIdx < 0) continue;

		const key = trimmed.slice(0, colonIdx).trim();
		const value = trimmed.slice(colonIdx + 1).trim();

		if (indent <= currentIndent) {
			while (stack.length > 0 && indent <= stack[stack.length - 1].indent) {
				stack.pop();
			}
			current = stack.length > 0 ? stack[stack.length - 1].obj : result;
		}

		if (value === "" || value.startsWith("#")) {
			const newObj: Record<string, any> = {};
			current[key] = newObj;
			stack.push({ indent, key, obj: newObj });
			current = newObj;
			currentIndent = indent;
		} else if (value.startsWith("- ")) {
			if (!Array.isArray(current[key])) current[key] = [];
			current[key].push(value.slice(2));
		} else {
			current[key] = value.replace(/^["']|["']$/g, "");
		}
	}

	return result as PluginManifest;
}

// ── Tests ──

describe("prevalidateManifest", () => {
	const VALID_MANIFEST = `
id: test-plugin
name: Test Plugin
version: 1.0.0
description: A test plugin
engine: ">=1.0.0"
entry: ./index.js
`;

	it("accepts valid plugin manifest", () => {
		assert.equal(prevalidateManifest(VALID_MANIFEST), true);
	});

	it("rejects manifest with !!js/function tag", () => {
		const malicious = `!!js/function: >\n  function(){ return {}; }`;
		assert.equal(prevalidateManifest(malicious), false);
	});

	it("rejects manifest with !!js/undefined tag", () => {
		assert.equal(prevalidateManifest("key: !!js/undefined"), false);
	});

	it("rejects manifest with !!js/regexp tag", () => {
		assert.equal(prevalidateManifest("pattern: !!js/regexp /x/"), false);
	});

	it("rejects manifest with !!python/ tag", () => {
		assert.equal(prevalidateManifest("!!python/name: malicious"), false);
	});

	it("rejects manifest with !!ruby/ tag", () => {
		assert.equal(prevalidateManifest("!!ruby/object: malicious"), false);
	});

	it("rejects manifest with !!php/ tag", () => {
		assert.equal(prevalidateManifest("!!php/class: malicious"), false);
	});

	it("accepts empty string", () => {
		assert.equal(prevalidateManifest(""), true);
	});

	it("accepts manifest with safe anchor references", () => {
		const withAnchor = `
defaults: &defaults
  enabled: true
plugin:
  <<: *defaults
  name: test
`;
		assert.equal(prevalidateManifest(withAnchor), true);
	});

	it("accepts manifest with safe tags like !!str, !!int, !!bool", () => {
		// YAML base types are safe
		const yaml = "count: !!int 5\nname: !!str hello\nactive: !!bool true";
		assert.equal(prevalidateManifest(yaml), true);
	});

	it("rejects if !!js/ appears anywhere in the manifest", () => {
		// Even in a comment-like context
		const yaml = "name: test\n# dangerous: !!js/function x";
		assert.equal(prevalidateManifest(yaml), false);
	});
});

describe("plugin manifest parsing (safe)", () => {
	it("parses normal plugin YAML", () => {
		const yaml = `
id: test-plugin
name: Test Plugin
version: 1.0.0
description: A test plugin
`;
		assert.equal(prevalidateManifest(yaml), true);
		const result = safeParseYaml(yaml);
		assert.equal(result?.id, "test-plugin");
		assert.equal(result?.name, "Test Plugin");
		assert.equal(result?.version, "1.0.0");
	});

	it("parses plugin with nested config schema", () => {
		const yaml = `
id: config-plugin
name: Config Plugin
version: 2.0.0
description: Has config schema
config:
  properties:
    apiKey:
      type: string
      env: PLUGIN_API_KEY
`;
		assert.equal(prevalidateManifest(yaml), true);
		const result = safeParseYaml(yaml);
		assert.equal(result?.id, "config-plugin");
		assert.ok(result?.config?.properties?.apiKey);
	});

	it("handles empty YAML gracefully", () => {
		assert.equal(prevalidateManifest(""), true);
		const result = safeParseYaml("");
		assert.equal(result, null);
	});
});

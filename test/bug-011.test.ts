import { describe, it } from "node:test";

interface ComposioTool {
	toolkitSlug: string;
	slug: string;
	description: string;
	parameters: Record<string, unknown>;
}

interface GCToolDefinition {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
	handler: (args: any) => Promise<string>;
}

function sanitizeOld(toolkitSlug: string, slug: string): string {
	return `composio_${toolkitSlug}_${slug}`.replace(/[^a-zA-Z0-9_]/g, "_");
}

function toGCToolNew(t: ComposioTool): GCToolDefinition {
	const rawName = `composio_${t.toolkitSlug}_${t.slug}`;
	const rawSlug = `${t.toolkitSlug}:${t.slug}`;
	let hash = 0;
	for (let i = 0; i < rawSlug.length; i++) {
		const char = rawSlug.charCodeAt(i);
		hash = ((hash << 5) - hash) + char;
		hash |= 0;
	}
	const hashStr = Math.abs(hash).toString(36).slice(0, 6);
	const safeName = rawName.replace(/[^a-zA-Z0-9_]/g, "_") + "_" + hashStr;

	let description = `[Composio/${t.toolkitSlug}] ${t.description}`;
	if (t.slug.includes("SEND_EMAIL")) {
		description += " \u2014 USE THIS to send emails directly.";
	} else if (t.slug.includes("CREATE_EMAIL_DRAFT")) {
		description += " \u2014 Only use when the user explicitly asks for a draft.";
	}
	return {
		name: safeName,
		description,
		inputSchema: t.parameters,
		handler: async (args: any) => JSON.stringify(args),
	};
}

describe("BUG-011: Composio Name Collision", () => {
	it("should demonstrate collision with old method", () => {
		const pairs: [string, string][] = [
			["google-mail", "send-email"],
			["google_mail", "send_email"],
		];
		const names = pairs.map(([t, s]) => sanitizeOld(t, s));
		if (names[0] !== names[1]) {
			throw new Error(`Expected collision but got different names: "${names[0]}" vs "${names[1]}"`);
		}
	});

	it("should produce unique names with hyphen vs underscore (new method)", () => {
		const pairs: [string, string][] = [
			["google-mail", "send-email"],
			["google_mail", "send_email"],
			["github", "issues-list"],
			["github_issues", "list"],
		];
		const names = pairs.map(([t, s]) => toGCToolNew({ toolkitSlug: t, slug: s, description: "", parameters: {} }).name);
		const unique = new Set(names);
		if (unique.size !== names.length) {
			throw new Error(`${names.length - unique.size} collision(s) detected`);
		}
	});

	it("should be idempotent (same input = same output)", () => {
		const name1 = toGCToolNew({ toolkitSlug: "google-mail", slug: "send-email", description: "", parameters: {} }).name;
		const name2 = toGCToolNew({ toolkitSlug: "google-mail", slug: "send-email", description: "", parameters: {} }).name;
		if (name1 !== name2) {
			throw new Error(`Not idempotent: "${name1}" vs "${name2}"`);
		}
	});

	it("should produce valid JS identifiers", () => {
		const testCases: [string, string][] = [
			["gmail", "send_email"],
			["google-mail", "send-email"],
			["slack", "post_message"],
			["github_issues", "list"],
			["123toolkit", "tool"],
		];
		for (const [t, s] of testCases) {
			const name = toGCToolNew({ toolkitSlug: t, slug: s, description: "", parameters: {} }).name;
			if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name)) {
				throw new Error(`Invalid identifier: "${name}"`);
			}
		}
	});

	it("should handle many tools without collisions", () => {
		const tools: ComposioTool[] = [];
		for (let i = 0; i < 1000; i++) {
			tools.push({
				toolkitSlug: `toolkit_${i % 50}`,
				slug: `tool_${i}`,
				description: "",
				parameters: {},
			});
		}
		const names = tools.map(t => toGCToolNew(t).name);
		const unique = new Set(names);
		if (unique.size !== names.length) {
			throw new Error(`${names.length - unique.size} collisions in ${names.length} tools`);
		}
	});
});

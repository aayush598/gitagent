import type { AgentTool } from "@mariozechner/pi-agent-core";
import type { GCToolDefinition, ToolResult } from "./sdk-types.js";
import { buildTypeboxSchema } from "./tool-loader.js";

// ── Convert GCToolDefinition → AgentTool ───────────────────────────────

export function toAgentTool(def: GCToolDefinition): AgentTool<ReturnType<typeof buildTypeboxSchema>> {
	const schema = buildTypeboxSchema(def.inputSchema);

	return {
		name: def.name,
		label: def.name,
		description: def.description,
		parameters: schema,
		execute: async (
			_toolCallId: string,
			params: Record<string, unknown>,
			signal?: AbortSignal,
		) => {
			const result: ToolResult = await def.handler(params, signal);
			return { content: [{ type: "text" as const, text: result.text }], details: result.details };
		},
	};
}

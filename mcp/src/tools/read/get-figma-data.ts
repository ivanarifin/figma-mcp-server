import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import type { TaskManager } from "../../task-manager.js";
import { getReadTaskTimeoutMs } from "../../timeout-config.js";
import { safeToolProcessor } from "../safe-tool-processor.js";

const GetFigmaDataParamsSchema = z.object({
    fileKey: z.string().optional().describe("Accepted for compatibility with Framelink/official-style Figma MCP. Local plugin mode ignores this because Figma is already open."),
    nodeId: z.string().optional().describe("Figma node ID. Accepts either 123:456 or URL style 123-456."),
    depth: z.number().int().min(0).max(20).default(3).optional().describe("How many levels deep to traverse. Defaults to 3 for compact code-generation context."),
});

type GetFigmaDataParams = z.infer<typeof GetFigmaDataParamsSchema>;

export function getFigmaData(server: McpServer, taskManager: TaskManager) {
    server.tool(
        "get_figma_data",
        "Official/Framelink-compatible local tool: get compact Figma node data for code generation via the currently open Figma plugin. Use nodeId from the Figma URL; fileKey is accepted but ignored in local mode.",
        GetFigmaDataParamsSchema.shape,
        async (params: GetFigmaDataParams) => {
            const nodeId = params.nodeId?.replace(/-/g, ":");
            if (!nodeId) {
                return {
                    isError: true,
                    content: [{
                        type: "text" as const,
                        text: "Missing nodeId. Local websocket mode needs a concrete nodeId from the open Figma file, e.g. node-id=189-3380 becomes nodeId=189:3380."
                    }]
                };
            }

            return await safeToolProcessor(
                taskManager.runTask("get-node-info", {
                    id: nodeId,
                    recursive: true,
                    maxDepth: params.depth ?? 3,
                }, getReadTaskTimeoutMs())
            );
        }
    );
}

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import type { TaskManager } from "../../task-manager.js";
import { getReadTaskTimeoutMs } from "../../timeout-config.js";
import { safeToolProcessor } from "../safe-tool-processor.js";

const GetFigmaDataParamsSchema = z.object({
    nodeId: z.string().describe("Required Figma node ID. Accepts either 123:456 or URL style 123-456."),
    depth: z.number().int().min(0).max(20).default(3).optional().describe("Optional traversal depth. Defaults to 3 for compact code-generation context."),
});

type GetFigmaDataParams = z.infer<typeof GetFigmaDataParamsSchema>;

export function getFigmaData(server: McpServer, taskManager: TaskManager) {
    server.tool(
        "get_figma_data",
        "Get compact local Figma node data for code generation via the currently open Figma plugin. Required: nodeId. Optional: depth. Use nodeId from the Figma URL; node-id=189-3380 becomes nodeId=189:3380.",
        GetFigmaDataParamsSchema.shape,
        async (params: GetFigmaDataParams) => {
            const { nodeId: rawNodeId, depth = 3 } = GetFigmaDataParamsSchema.parse(params);
            const nodeId = rawNodeId.replace(/-/g, ":");

            return await safeToolProcessor(
                taskManager.runTask("get-node-info", {
                    id: nodeId,
                    recursive: true,
                    maxDepth: depth,
                }, getReadTaskTimeoutMs())
            );
        }
    );
}

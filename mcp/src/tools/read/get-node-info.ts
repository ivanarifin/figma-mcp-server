import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import type { TaskManager } from "../../task-manager.js";
import { GetNodeInfoParamsSchema, type GetNodeInfoParams } from "../../shared/types/index.js";
import { safeToolProcessor } from "../safe-tool-processor.js";

export function getNodeInfo(server: McpServer, taskManager: TaskManager) {
    server.tool(
        "get-node-info",
        "Get a compact official-like Figma node tree for code generation. Recursive is true by default and maxDepth defaults to 3 to avoid huge timeouts; increase maxDepth only for smaller nodes.",
        GetNodeInfoParamsSchema.shape,
        async (params: GetNodeInfoParams) => {
            return await safeToolProcessor<GetNodeInfoParams>(
                taskManager.runTask("get-node-info", params)
            );
        }
    )
}
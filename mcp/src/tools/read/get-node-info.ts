import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import type { TaskManager } from "../../task-manager.js";
import { GetNodeInfoParamsSchema, type GetNodeInfoParams } from "../../shared/types/index.js";
import { safeToolProcessor } from "../safe-tool-processor.js";

export function getNodeInfo(server: McpServer, taskManager: TaskManager) {
    server.tool(
        "get-node-info",
        "Get the information of a node. Supports recursive mapping to get full deep children structure for 1:1 coding.",
        GetNodeInfoParamsSchema.shape,
        async (params: GetNodeInfoParams) => {
            return await safeToolProcessor<GetNodeInfoParams>(
                taskManager.runTask("get-node-info", params)
            );
        }
    )
}
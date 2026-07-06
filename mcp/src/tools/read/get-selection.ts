import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import type { TaskManager } from "../../task-manager.js";
import { safeToolProcessor } from "../safe-tool-processor.js";

export function getSelection(server: McpServer, taskManager: TaskManager) {
    server.tool(
        "get-selection",
        "Get the current selection in Figma.",
        {},
        async () => {
            return await safeToolProcessor(
                taskManager.runTask("get-selection", {})
            );
        }
    );
}

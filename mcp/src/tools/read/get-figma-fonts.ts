import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import type { TaskManager } from "../../task-manager.js";
import { GetFigmaFontsParamsSchema } from "../../shared/types/index.js";
import { getReadTaskTimeoutMs } from "../../timeout-config.js";
import { safeToolProcessor } from "../safe-tool-processor.js";

export function getFigmaFonts(server: McpServer, taskManager: TaskManager) {
    server.tool(
        "get_figma_fonts",
        "Get font inventory used inside a Figma node tree via the currently open local Figma plugin. Required: nodeId. Optional: depth. This returns font family/style usage metadata; Figma does not allow downloading .ttf/.otf font files through the plugin API.",
        {
            nodeId: GetFigmaFontsParamsSchema.shape.nodeId,
            depth: GetFigmaFontsParamsSchema.shape.depth,
        },
        async ({ nodeId, depth }) => {
            const parsed = GetFigmaFontsParamsSchema.parse({ nodeId, depth });
            return await safeToolProcessor(
                taskManager.runTask("get_figma_fonts", {
                    nodeId: parsed.nodeId.replace(/-/g, ":"),
                    depth: parsed.depth ?? 10,
                }, getReadTaskTimeoutMs())
            );
        }
    );
}

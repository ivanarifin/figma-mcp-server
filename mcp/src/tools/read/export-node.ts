import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import type { TaskManager } from "../../task-manager.js";
import { ExportNodeParamsSchema } from "../../shared/types/index.js";
import * as fs from "fs";
import * as path from "path";

export function exportNode(server: McpServer, taskManager: TaskManager) {
    server.tool(
        "export-node",
        "Export a Figma node (frame, component, vector, etc.) as PNG, SVG, PDF, or JPG, and save it to the user's Downloads or Projects directory, returning the path.",
        {
            id: ExportNodeParamsSchema.shape.id,
            format: ExportNodeParamsSchema.shape.format,
            scale: ExportNodeParamsSchema.shape.scale,
        },
        async ({ id, format, scale }) => {
            const taskFormat = format || "PNG";
            const taskScale = scale || 1;
            
            const result = await taskManager.runTask<any, any>("export-node", {
                id,
                format: taskFormat,
                scale: taskScale
            });

            if (result && result.bytes) {
                try {
                    // Save to user's downloads folder or current Projects dir
                    const homeDir = process.env.HOME || process.env.USERPROFILE || "";
                    const downloadsDir = path.join(homeDir, "Downloads");
                    
                    // Create clean file name
                    const safeName = result.name.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
                    const ext = taskFormat.toLowerCase();
                    const fileName = `${safeName}_${id.replace(":", "-")}.${ext}`;
                    const targetPath = path.join(downloadsDir, fileName);

                    // Convert array of bytes back to Buffer
                    const buffer = Buffer.from(result.bytes);
                    
                    fs.writeFileSync(targetPath, buffer);

                    return {
                        content: [{
                            type: "text",
                            text: `Successfully exported node "${result.name}" (${id}) as ${taskFormat} at ${taskScale}x scale.\nSaved to: ${targetPath}`
                        }],
                        isError: false
                    };
                } catch (writeErr) {
                    return {
                        content: [{
                            type: "text",
                            text: `Failed to save exported file to disk: ${writeErr instanceof Error ? writeErr.message : String(writeErr)}`
                        }],
                        isError: true
                    };
                }
            }

            return {
                content: [{
                    type: "text",
                    text: `Export failed or returned empty payload. Result: ${JSON.stringify(result)}`
                }],
                isError: true
            };
        }
    );
}

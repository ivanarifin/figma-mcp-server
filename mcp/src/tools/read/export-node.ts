import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import type { TaskManager, TaskResult } from "../../task-manager.js";
import { ExportNodeParamsSchema } from "../../shared/types/index.js";
import * as fs from "fs";
import * as path from "path";

function sanitizeForAi(value: any): any {
    if (Array.isArray(value)) {
        // The export payload stores raw image bytes as a number[]. Never stringify that into AI context.
        if (value.length > 0 && value.every((item) => typeof item === "number")) {
            return `[${value.length} bytes]`;
        }
        return value.map(sanitizeForAi);
    }

    if (value && typeof value === "object") {
        const output: any = {};
        for (const [key, childValue] of Object.entries(value)) {
            if (key === "bytes" || key === "imageData" || key === "data") {
                if (Array.isArray(childValue)) {
                    output[key] = `[${childValue.length} bytes]`;
                } else {
                    output[key] = "[binary data]";
                }
            } else {
                output[key] = sanitizeForAi(childValue);
            }
        }
        return output;
    }

    return value;
}

function getPayloadSize(bytes: unknown): number {
    return Array.isArray(bytes) ? bytes.length : 0;
}

export function exportNode(server: McpServer, taskManager: TaskManager) {
    server.tool(
        "export-node",
        "Export a Figma node (frame, component, vector, etc.) as PNG, SVG, PDF, or JPG, save it to the user's Downloads directory, and return only the saved file path. Raw image bytes are never returned to AI context.",
        {
            id: ExportNodeParamsSchema.shape.id,
            format: ExportNodeParamsSchema.shape.format,
            scale: ExportNodeParamsSchema.shape.scale,
        },
        async ({ id, format, scale }) => {
            const taskFormat = format || "PNG";
            const taskScale = Math.max(0.1, Math.min(scale || 1, 4));

            const taskResult = await taskManager.runTask<TaskResult, any>("export-node", {
                id,
                format: taskFormat,
                scale: taskScale
            }, 120000);

            const payload = taskResult?.content;

            if (taskResult?.isError) {
                return {
                    content: [{
                        type: "text",
                        text: `Export failed: ${JSON.stringify(sanitizeForAi(payload))}`
                    }],
                    isError: true
                };
            }

            if (payload && Array.isArray(payload.bytes)) {
                try {
                    const homeDir = process.env.HOME || process.env.USERPROFILE || "";
                    const downloadsDir = path.join(homeDir, "Downloads");
                    fs.mkdirSync(downloadsDir, { recursive: true });

                    const nodeName = typeof payload.name === "string" ? payload.name : "figma-export";
                    const safeName = nodeName.replace(/[^a-z0-9_-]/gi, "_").toLowerCase();
                    const ext = taskFormat.toLowerCase();
                    const safeId = id.replace(/[:/\\]/g, "-");
                    const fileName = `${safeName}_${safeId}.${ext}`;
                    const targetPath = path.join(downloadsDir, fileName);

                    const buffer = Buffer.from(payload.bytes);
                    fs.writeFileSync(targetPath, buffer);

                    return {
                        content: [{
                            type: "text",
                            text: `Successfully exported node "${nodeName}" (${id}) as ${taskFormat} at ${taskScale}x scale.\nSaved to: ${targetPath}\nSize: ${buffer.length} bytes`
                        }],
                        isError: false
                    };
                } catch (writeErr) {
                    return {
                        content: [{
                            type: "text",
                            text: `Failed to save exported file to disk: ${writeErr instanceof Error ? writeErr.message : String(writeErr)}. Payload size: ${getPayloadSize(payload.bytes)} bytes`
                        }],
                        isError: true
                    };
                }
            }

            return {
                content: [{
                    type: "text",
                    text: `Export failed or returned empty payload. Result: ${JSON.stringify(sanitizeForAi(taskResult))}`
                }],
                isError: true
            };
        }
    );
}

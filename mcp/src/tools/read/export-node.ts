import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import type { TaskManager, TaskResult } from "../../task-manager.js";
import { ExportNodeParamsSchema } from "../../shared/types/index.js";
import * as fs from "fs";
import * as path from "path";

function sanitizeForAi(value: any): any {
    if (Array.isArray(value)) {
        if (value.length > 0 && value.every((item) => typeof item === "number")) {
            return `[${value.length} bytes]`;
        }
        return value.map(sanitizeForAi);
    }

    if (value && typeof value === "object") {
        const output: any = {};
        for (const [key, childValue] of Object.entries(value)) {
            if (key === "bytes" || key === "imageData" || key === "data") {
                output[key] = Array.isArray(childValue) ? `[${childValue.length} bytes]` : "[binary data]";
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

function getDefaultOutputDir(): string {
    return path.resolve(process.cwd(), "assets", "figma");
}

function sanitizeName(name: string): string {
    return name.replace(/[^a-z0-9_-]/gi, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").toLowerCase() || "figma-export";
}

function getSafeTargetPath(outputDir: string, fileName: string, ext: string): string {
    const resolvedOutputDir = path.resolve(outputDir);
    const safeFileName = sanitizeName(fileName);
    const targetPath = path.resolve(resolvedOutputDir, `${safeFileName}.${ext}`);

    if (!targetPath.startsWith(resolvedOutputDir + path.sep) && targetPath !== resolvedOutputDir) {
        throw new Error("Invalid output path");
    }

    return targetPath;
}

export function exportNode(server: McpServer, taskManager: TaskManager) {
    server.tool(
        "export-node",
        "Export a specific Figma asset node (logo/icon/vector/image) to a local workspace assets folder and return only the saved file path. Defaults to ./assets/figma. Refuses to export containers/screens unless allowFrameExport=true.",
        {
            id: ExportNodeParamsSchema.shape.id,
            format: ExportNodeParamsSchema.shape.format,
            scale: ExportNodeParamsSchema.shape.scale,
            outputDir: ExportNodeParamsSchema.shape.outputDir,
            fileName: ExportNodeParamsSchema.shape.fileName,
            allowFrameExport: ExportNodeParamsSchema.shape.allowFrameExport,
        },
        async ({ id, format, scale, outputDir, fileName, allowFrameExport }) => {
            const taskFormat = format || "PNG";
            const taskScale = Math.max(0.1, Math.min(scale || 1, 4));
            const resolvedOutputDir = outputDir ? path.resolve(outputDir) : getDefaultOutputDir();

            const taskResult = await taskManager.runTask<TaskResult, any>("export-node", {
                id,
                format: taskFormat,
                scale: taskScale,
                allowFrameExport: allowFrameExport === true
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
                    fs.mkdirSync(resolvedOutputDir, { recursive: true });

                    const nodeName = typeof payload.name === "string" ? payload.name : "figma-export";
                    const ext = taskFormat.toLowerCase();
                    const safeId = id.replace(/[:/\\]/g, "-");
                    const baseFileName = fileName || `${nodeName}_${safeId}`;
                    const targetPath = getSafeTargetPath(resolvedOutputDir, baseFileName, ext);

                    const buffer = Buffer.from(payload.bytes);
                    fs.writeFileSync(targetPath, buffer);

                    return {
                        content: [{
                            type: "text",
                            text: [
                                `Successfully exported Figma asset node "${nodeName}" (${id}) as ${taskFormat} at ${taskScale}x scale.`,
                                `Saved to: ${targetPath}`,
                                `Size: ${buffer.length} bytes`,
                                `Use this local file path in generated code instead of embedding image bytes.`,
                                allowFrameExport === true ? `Note: allowFrameExport=true was used; this may be a full frame/screen screenshot.` : `Frame/container export guard was enabled.`
                            ].join("\n")
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

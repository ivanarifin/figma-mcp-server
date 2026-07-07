import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import type { TaskManager, TaskResult } from "../../task-manager.js";
import { getImageDownloadTimeoutMs } from "../../timeout-config.js";
import { logEvent } from "../../logger.js";
import * as fs from "fs";
import * as path from "path";

const DownloadFigmaImagesParamsSchema = z.object({
    nodeId: z.string().describe("Required Figma asset node ID. Accepts either 123:456 or URL style 123-456. Must be a specific asset child node, not a parent screen/frame."),
    fileName: z.string().regex(/^[a-zA-Z0-9_.-]+\.(png|svg|jpg|jpeg|pdf)$/).describe("Required local file name, including extension. The extension controls export format."),
    localPath: z.string().default("assets").optional().describe("Optional workspace-relative folder. Defaults to assets. Use e.g. src/assets, public/images, app/assets, or assets/onboarding if appropriate."),
});

type DownloadFigmaImagesParams = z.infer<typeof DownloadFigmaImagesParamsSchema>;

function resolveLocalPath(localPath?: string): string {
    const base = process.cwd();
    const requested = localPath || "assets";
    const resolved = path.isAbsolute(requested) ? path.resolve(requested) : path.resolve(base, requested);

    if (!resolved.startsWith(base + path.sep) && resolved !== base) {
        throw new Error(`Invalid localPath: ${requested}. Use a path inside the current workspace, e.g. assets, src/assets, public/images, or app/assets.`);
    }
    return resolved;
}

function formatFromFileName(fileName: string): "PNG" | "SVG" | "PDF" | "JPG" {
    const ext = path.extname(fileName).toLowerCase();
    if (ext === ".svg") return "SVG";
    if (ext === ".pdf") return "PDF";
    if (ext === ".jpg" || ext === ".jpeg") return "JPG";
    return "PNG";
}

function safeFileName(fileName: string): string {
    return path.basename(fileName).replace(/[^a-zA-Z0-9_.-]/g, "_");
}

function payloadToBuffer(payload: any): Buffer | undefined {
    if (typeof payload?.bytesBase64 === "string") {
        return Buffer.from(payload.bytesBase64, "base64");
    }
    if (Array.isArray(payload?.bytes)) {
        return Buffer.from(payload.bytes);
    }
    return undefined;
}

function summarizeFailure(value: any): string {
    if (!value) return "unknown error";
    if (typeof value === "string") return value;
    const clone = { ...value };
    if (clone.bytesBase64) clone.bytesBase64 = `[base64 ${clone.bytesBase64.length} chars]`;
    if (clone.bytes) clone.bytes = Array.isArray(clone.bytes) ? `[${clone.bytes.length} bytes]` : "[binary data]";
    return JSON.stringify(clone);
}

export function downloadFigmaImages(server: McpServer, taskManager: TaskManager) {
    server.tool(
        "download_figma_images",
        "Download exactly ONE Figma asset node to the local workspace. Required params only: nodeId and fileName. Optional: localPath. Use specific child asset IDs from get_figma_data exportableAssets; do not pass parent screen/frame IDs. For multiple assets, call this tool repeatedly one at a time.",
        DownloadFigmaImagesParamsSchema.shape,
        async (params: DownloadFigmaImagesParams) => {
            try {
                const { nodeId: rawNodeId, fileName: rawFileName, localPath = "assets" } = DownloadFigmaImagesParamsSchema.parse(params);
                logEvent('download_figma_images.start', { nodeId: rawNodeId, fileName: rawFileName, localPath });

                const outputDir = resolveLocalPath(localPath);
                fs.mkdirSync(outputDir, { recursive: true });

                const nodeId = rawNodeId.replace(/-/g, ":");
                const fileName = safeFileName(rawFileName);
                const format = formatFromFileName(fileName);
                const scale = 1;
                logEvent('download_figma_images.export_task_start', { nodeId, fileName, format, scale, timeoutMs: getImageDownloadTimeoutMs() });

                const taskResult = await taskManager.runTask<TaskResult, any>("export-node", {
                    id: nodeId,
                    format,
                    scale,
                    allowFrameExport: false,
                }, getImageDownloadTimeoutMs());

                logEvent('download_figma_images.export_task_done', { nodeId, fileName, isError: taskResult?.isError, contentKeys: taskResult?.content && typeof taskResult.content === 'object' ? Object.keys(taskResult.content) : undefined });
                const buffer = payloadToBuffer(taskResult?.content);
                if (taskResult?.isError || !buffer) {
                    return {
                        content: [{
                            type: "text" as const,
                            text: `Failed to download ${fileName}: ${summarizeFailure(taskResult?.content ?? taskResult)}`
                        }],
                        isError: true,
                    };
                }

                const targetPath = path.resolve(outputDir, fileName);
                if (!targetPath.startsWith(outputDir + path.sep)) {
                    return {
                        content: [{ type: "text" as const, text: `Failed to download ${fileName}: invalid file path` }],
                        isError: true,
                    };
                }

                logEvent('download_figma_images.write_start', { nodeId, targetPath, bytes: buffer.length });
                fs.writeFileSync(targetPath, buffer);
                logEvent('download_figma_images.write_done', { nodeId, targetPath, bytes: buffer.length });
                const source = taskResult.content?.source ? ` | source=${taskResult.content.source}` : "";

                return {
                    content: [{
                        type: "text" as const,
                        text: `Downloaded Figma asset to \`${outputDir}\`:\n- ${fileName}: ${buffer.length} bytes${source} -> ${targetPath}`
                    }],
                    isError: false,
                };
            } catch (error) {
                return {
                    content: [{
                        type: "text" as const,
                        text: `Failed to download Figma image: ${error instanceof Error ? error.message : String(error)}. Required params: nodeId and fileName. Optional param: localPath.`
                    }],
                    isError: true,
                };
            }
        }
    );
}

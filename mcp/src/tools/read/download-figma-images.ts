import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import type { TaskManager, TaskResult } from "../../task-manager.js";
import { getImageDownloadTimeoutMs } from "../../timeout-config.js";
import * as fs from "fs";
import * as path from "path";

const DownloadFigmaImagesParamsSchema = z.object({
    fileKey: z.string().optional().describe("Accepted for Framelink/official compatibility. Ignored in local websocket mode."),
    nodes: z.array(z.object({
        nodeId: z.string().describe("Figma node ID to export, e.g. 189:3380 or URL style 189-3380."),
        imageRef: z.string().optional().describe("Accepted for compatibility. Ignored in local websocket mode; nodeId is exported directly."),
        gifRef: z.string().optional().describe("Accepted for compatibility. GIF export is not supported in local plugin mode."),
        fileName: z.string().regex(/^[a-zA-Z0-9_.-]+\.(png|svg|jpg|jpeg|pdf)$/).describe("Local file name, including extension."),
        needsCropping: z.boolean().optional(),
        cropTransform: z.array(z.array(z.number())).optional(),
        requiresImageDimensions: z.boolean().optional(),
        filenameSuffix: z.string().regex(/^[a-zA-Z0-9_-]+$/).optional(),
    })).length(1, "download_figma_images supports exactly one image per request in local websocket mode. Call this tool repeatedly for multiple assets.").describe("Exactly one asset node to export. Use specific logo/icon/image child node, not parent screens. For multiple assets, call this tool once per asset."),
    pngScale: z.number().positive().max(4).default(2).optional(),
    localPath: z.string().default("assets").optional().describe("Directory to save images, relative to current workspace by default. Defaults to assets; if the project has a more specific folder, pass it explicitly, e.g. src/assets, public/images, or app/assets."),
    allowFrameExport: z.boolean().default(false).optional().describe("Set true only if intentionally downloading full screen/frame screenshots."),
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
        "Official/Framelink-compatible local tool: export exactly ONE SVG/PNG/JPG/PDF asset node from the currently open Figma plugin into a workspace-relative directory. IMPORTANT: local websocket mode intentionally supports one image per request only; for multiple assets, call download_figma_images repeatedly, one node at a time. Defaults to ./assets; if the project has a more specific asset folder (src/assets, public/images, app/assets), pass localPath explicitly. Uses the stable rendered export path (same as export-node), not the original image hash path, because imageHash bytes can hang in Figma plugin runtime. Use IDs from get_figma_data/get-node-info exportableAssets; do not use parent screen/frame IDs unless allowFrameExport=true.",
        DownloadFigmaImagesParamsSchema.shape,
        async (params: DownloadFigmaImagesParams) => {
            try {
                const { nodes, pngScale = 2, localPath = "assets", allowFrameExport = false } = DownloadFigmaImagesParamsSchema.parse(params);
                const request = nodes[0];
                if (!request) {
                    return {
                        content: [{
                            type: "text" as const,
                            text: "download_figma_images requires exactly one node. For multiple assets, call this tool repeatedly, one asset per request."
                        }],
                        isError: true,
                    };
                }

                const outputDir = resolveLocalPath(localPath);
                fs.mkdirSync(outputDir, { recursive: true });

                const nodeId = request.nodeId.replace(/-/g, ":");
                const format = formatFromFileName(request.fileName);
                const scale = format === "PNG" || format === "JPG" ? Math.max(0.1, Math.min(pngScale, 4)) : 1;

                const taskResult = await taskManager.runTask<TaskResult, any>("export-node", {
                    id: nodeId,
                    format,
                    scale,
                    allowFrameExport,
                }, getImageDownloadTimeoutMs());

                const buffer = payloadToBuffer(taskResult?.content);
                if (taskResult?.isError || !buffer) {
                    return {
                        content: [{
                            type: "text" as const,
                            text: `Failed to download ${request.fileName}: ${summarizeFailure(taskResult?.content ?? taskResult)}`
                        }],
                        isError: true,
                    };
                }

                const fileName = safeFileName(request.fileName);
                const targetPath = path.resolve(outputDir, fileName);
                if (!targetPath.startsWith(outputDir + path.sep)) {
                    return {
                        content: [{ type: "text" as const, text: `Failed to download ${request.fileName}: invalid file path` }],
                        isError: true,
                    };
                }

                fs.writeFileSync(targetPath, buffer);
                const source = taskResult.content?.source ? ` | source=${taskResult.content.source}` : "";

                return {
                    content: [{
                        type: "text" as const,
                        text: `Downloaded 1/1 Figma asset to \`${outputDir}\`:\n- ${fileName}: ${buffer.length} bytes${source} -> ${targetPath}\nFor multiple assets, call download_figma_images again for the next asset.`
                    }],
                    isError: false,
                };
            } catch (error) {
                return {
                    content: [{
                        type: "text" as const,
                        text: `Failed to download Figma image: ${error instanceof Error ? error.message : String(error)}. If you passed multiple nodes, retry with exactly one node per request.`
                    }],
                    isError: true,
                };
            }
        }
    );
}

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import type { TaskManager, TaskResult } from "../../task-manager.js";
import { getExportTaskTimeoutMs } from "../../timeout-config.js";
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
    })).describe("Asset nodes to export. Use specific logo/icon/image child nodes, not parent screens."),
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
        "Official/Framelink-compatible local tool: export SVG/PNG/JPG/PDF asset nodes from the currently open Figma plugin into a workspace-relative directory. Defaults to ./assets; if the project has a more specific asset folder (src/assets, public/images, app/assets), pass localPath explicitly. Uses original image fill bytes when possible. Use IDs from get_figma_data/get-node-info exportableAssets; do not use parent screen/frame IDs unless allowFrameExport=true.",
        DownloadFigmaImagesParamsSchema.shape,
        async (params: DownloadFigmaImagesParams) => {
            try {
                const { nodes, pngScale = 2, localPath = "assets", allowFrameExport = false } = DownloadFigmaImagesParamsSchema.parse(params);
                const outputDir = resolveLocalPath(localPath);
                fs.mkdirSync(outputDir, { recursive: true });

                const results: string[] = [];
                let successCount = 0;

                for (const request of nodes) {
                    const nodeId = request.nodeId.replace(/-/g, ":");
                    const format = formatFromFileName(request.fileName);
                    const scale = format === "PNG" || format === "JPG" ? Math.max(0.1, Math.min(pngScale, 4)) : 1;

                    const taskResult = await taskManager.runTask<TaskResult, any>("export-node", {
                        id: nodeId,
                        format,
                        scale,
                        allowFrameExport,
                    }, getExportTaskTimeoutMs());

                    const buffer = payloadToBuffer(taskResult?.content);
                    if (taskResult?.isError || !buffer) {
                        results.push(`- ${request.fileName}: FAILED ${summarizeFailure(taskResult?.content ?? taskResult)}`);
                        continue;
                    }

                    const fileName = safeFileName(request.fileName);
                    const targetPath = path.resolve(outputDir, fileName);
                    if (!targetPath.startsWith(outputDir + path.sep)) {
                        results.push(`- ${request.fileName}: FAILED invalid file path`);
                        continue;
                    }

                    fs.writeFileSync(targetPath, buffer);
                    successCount++;
                    const source = taskResult.content?.source ? ` | source=${taskResult.content.source}` : "";
                    results.push(`- ${fileName}: ${buffer.length} bytes${source} -> ${targetPath}`);
                }

                return {
                    content: [{
                        type: "text" as const,
                        text: `Downloaded ${successCount}/${nodes.length} Figma asset(s) to \`${outputDir}\`:\n${results.join("\n")}`
                    }],
                    isError: successCount === 0 && nodes.length > 0,
                };
            } catch (error) {
                return {
                    content: [{
                        type: "text" as const,
                        text: `Failed to download Figma images: ${error instanceof Error ? error.message : String(error)}`
                    }],
                    isError: true,
                };
            }
        }
    );
}

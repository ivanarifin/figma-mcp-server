import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import type { TaskManager, TaskResult } from "../../task-manager.js";
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
    localPath: z.string().default("assets/figma").optional().describe("Directory to save images, relative to current workspace by default."),
    allowFrameExport: z.boolean().default(false).optional().describe("Set true only if intentionally downloading full screen/frame screenshots."),
});

type DownloadFigmaImagesParams = z.infer<typeof DownloadFigmaImagesParamsSchema>;

function resolveLocalPath(localPath?: string): string {
    const base = process.cwd();
    const requested = localPath || "assets/figma";
    const resolved = path.isAbsolute(requested) ? path.resolve(requested) : path.resolve(base, requested);

    // Keep writes inside the current workspace unless the caller gives an explicit absolute path under cwd.
    if (!resolved.startsWith(base + path.sep) && resolved !== base) {
        throw new Error(`Invalid localPath: ${requested}. Use a path inside the current workspace, e.g. assets/figma or public/images.`);
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

export function downloadFigmaImages(server: McpServer, taskManager: TaskManager) {
    server.tool(
        "download_figma_images",
        "Official/Framelink-compatible local tool: export SVG/PNG/JPG/PDF asset nodes from the currently open Figma plugin into a workspace-relative directory. Use IDs from get_figma_data/get-node-info exportableAssets; do not use parent screen/frame IDs unless allowFrameExport=true.",
        DownloadFigmaImagesParamsSchema.shape,
        async (params: DownloadFigmaImagesParams) => {
            try {
                const { nodes, pngScale = 2, localPath = "assets/figma", allowFrameExport = false } = DownloadFigmaImagesParamsSchema.parse(params);
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
                    }, 120000);

                    if (taskResult?.isError || !taskResult?.content?.bytes) {
                        results.push(`- ${request.fileName}: FAILED ${JSON.stringify(taskResult?.content ?? taskResult)}`);
                        continue;
                    }

                    const fileName = safeFileName(request.fileName);
                    const targetPath = path.resolve(outputDir, fileName);
                    if (!targetPath.startsWith(outputDir + path.sep)) {
                        results.push(`- ${request.fileName}: FAILED invalid file path`);
                        continue;
                    }

                    const buffer = Buffer.from(taskResult.content.bytes);
                    fs.writeFileSync(targetPath, buffer);
                    successCount++;
                    results.push(`- ${fileName}: ${buffer.length} bytes -> ${targetPath}`);
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

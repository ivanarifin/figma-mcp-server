import { z } from "zod";

export const ExportNodeParamsSchema = z.object({
    id: z.string(),
    format: z.enum(["PNG", "SVG", "PDF", "JPG"]).default("PNG").optional(),
    scale: z.number().min(0.1).max(4).default(1).optional(),
    outputDir: z.string().optional().describe("Optional output directory. Defaults to <current workspace>/assets/figma."),
    fileName: z.string().optional().describe("Optional file name without extension. Defaults to sanitized Figma node name + node id."),
    allowFrameExport: z.boolean().default(false).optional().describe("Set true only when intentionally exporting a whole screen/frame screenshot. False prevents accidental full-screen exports."),
});

export type ExportNodeParams = z.infer<typeof ExportNodeParamsSchema>;

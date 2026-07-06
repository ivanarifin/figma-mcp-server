import { z } from "zod";

export const ExportNodeParamsSchema = z.object({
    id: z.string(),
    format: z.enum(["PNG", "SVG", "PDF", "JPG"]).default("PNG").optional(),
    scale: z.number().min(0.1).max(4).default(1).optional(),
});

export type ExportNodeParams = z.infer<typeof ExportNodeParamsSchema>;

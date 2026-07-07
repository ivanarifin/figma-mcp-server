import { z } from "zod";

export const GetFigmaFontsParamsSchema = z.object({
    nodeId: z.string().describe("Required Figma node ID. Accepts either 123:456 or URL style 123-456."),
    depth: z.number().int().min(0).max(20).default(10).optional().describe("Optional traversal depth for scanning text nodes. Defaults to 10."),
});

export type GetFigmaFontsParams = z.infer<typeof GetFigmaFontsParamsSchema>;

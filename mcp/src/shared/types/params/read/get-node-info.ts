import { z } from "zod";

export const GetNodeInfoParamsSchema = z.object({
    id: z.string(),
    recursive: z.boolean().default(true).optional(),
    maxDepth: z.number().int().min(0).max(20).default(3).optional(),
});

export type GetNodeInfoParams = z.infer<typeof GetNodeInfoParamsSchema>;
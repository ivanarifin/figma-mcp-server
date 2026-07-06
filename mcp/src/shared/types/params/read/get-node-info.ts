import { z } from "zod";

export const GetNodeInfoParamsSchema = z.object({
    id: z.string(),
    recursive: z.boolean().default(false).optional(),
});

export type GetNodeInfoParams = z.infer<typeof GetNodeInfoParamsSchema>;
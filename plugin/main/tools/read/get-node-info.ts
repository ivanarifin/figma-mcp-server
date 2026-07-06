import type { GetNodeInfoParams } from "@shared/types";
import { serializeNode } from "../../serialization/serialization";
import { ToolResult } from "../tool-result";

export async function getNodeInfo(args: GetNodeInfoParams): Promise<ToolResult> {
    const node = await figma.getNodeByIdAsync(args.id);
    if (node) {
        // Since schema default is true, if args.recursive is undefined (not passed), we default to true.
        const shouldBeRecursive = args.recursive !== false;
        const serializedNode = serializeNode(node as SceneNode, new Set(), shouldBeRecursive);
        return {
            isError: false,
            content: serializedNode
        };
    }
    return {
        isError: true,
        content: "Node not found"
    };
}
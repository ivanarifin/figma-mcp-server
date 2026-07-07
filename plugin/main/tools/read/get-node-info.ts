import type { GetNodeInfoParams } from "@shared/types";
import { serializeNode } from "../../serialization/serialization";
import { ToolResult } from "../tool-result";

const ASSET_NODE_TYPES = new Set(["VECTOR", "BOOLEAN_OPERATION", "STAR", "ELLIPSE", "POLYGON", "LINE"]);
const CONTAINER_TYPES = new Set(["FRAME", "COMPONENT", "COMPONENT_SET", "INSTANCE", "GROUP", "SECTION"]);

function collectExportableAssets(node: any, assets: any[] = []): any[] {
    const hasImageFill = Array.isArray(node.fills) && node.fills.some((fill: any) => fill?.type === "IMAGE");
    const isVectorLike = ASSET_NODE_TYPES.has(node.type);
    const isSmallContainer = CONTAINER_TYPES.has(node.type) && (node.childrenCount || 0) > 0 && (node.width || 0) <= 256 && (node.height || 0) <= 256;

    if (hasImageFill || isVectorLike || isSmallContainer) {
        assets.push({
            id: node.id,
            name: node.name,
            type: node.type,
            width: node.width,
            height: node.height,
            reason: hasImageFill ? "image-fill" : isVectorLike ? "vector-like" : "small-container/icon-candidate",
            recommendedExportFormat: isVectorLike || isSmallContainer ? "SVG" : "PNG",
            exportHint: `Use MCP tool download_figma_images with nodeId \"${node.id}\" and a fileName. Do not use parent screens/frames as assets.`
        });
    }

    if (Array.isArray(node.children)) {
        for (const child of node.children) {
            collectExportableAssets(child, assets);
        }
    }

    return assets;
}

export async function getNodeInfo(args: GetNodeInfoParams): Promise<ToolResult> {
    const normalizedId = args.id.replace(/-/g, ":");
    const node = await figma.getNodeByIdAsync(normalizedId);
    if (node) {
        // Since schema default is true, if args.recursive is undefined (not passed), we default to true.
        const shouldBeRecursive = args.recursive !== false;
        const maxDepth = args.maxDepth ?? 3;
        const serializedNode = serializeNode(node as SceneNode, new Set(), shouldBeRecursive, maxDepth);
        const exportableAssets = collectExportableAssets(serializedNode).slice(0, 100);

        return {
            isError: false,
            content: {
                purpose: "Use this compact Figma node tree to generate code. Map layoutMode/padding/itemSpacing to flexbox, text fields to typography, fills/strokes/effects to CSS styles. For logos/icons/images, download the specific child asset node from exportableAssets using MCP tool download_figma_images; do not export the whole screen/frame.",
                usageHints: [
                    "For code generation: read node.children recursively and translate layout/style properties into code.",
                    "For assets: choose the smallest relevant exportableAssets item (logo/icon/image), then call MCP tool download_figma_images with that child nodeId and a fileName.",
                    "Avoid parent screen/container frames as assets. download_figma_images is the supported asset-download tool for Figma-to-code.",
                    "If childrenTruncated=true, call get-node-info on the relevant child id or increase maxDepth for smaller nodes."
                ],
                requestedNodeId: normalizedId,
                recursive: shouldBeRecursive,
                maxDepth,
                exportableAssets,
                node: serializedNode
            }
        };
    }
    return {
        isError: true,
        content: "Node not found"
    };
}

import type { ExportNodeParams } from "@shared/types";
import { ToolResult } from "../tool-result";

const CONTAINER_TYPES = new Set<string>([
    "FRAME",
    "COMPONENT",
    "COMPONENT_SET",
    "INSTANCE",
    "GROUP",
    "SECTION",
]);

function uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
}

function getFirstVisibleImagePaint(node: SceneNode): ImagePaint | undefined {
    if (!("fills" in node)) {
        return undefined;
    }

    const fills = node.fills;
    if (fills === figma.mixed || !Array.isArray(fills)) {
        return undefined;
    }

    return fills.find((paint): paint is ImagePaint => (
        paint.type === "IMAGE" &&
        paint.visible !== false &&
        typeof paint.imageHash === "string" &&
        paint.imageHash.length > 0
    ));
}

export async function exportNode(args: ExportNodeParams): Promise<ToolResult> {
    try {
        const node = await figma.getNodeByIdAsync(args.id.replace(/-/g, ":"));
        if (!node) {
            return {
                isError: true,
                content: "Node not found"
            };
        }

        // Only SceneNode (visual elements) can be exported. Document or Page cannot be exported directly.
        if (node.type === "DOCUMENT" || node.type === "PAGE") {
            return {
                isError: true,
                content: `Cannot export node of type ${node.type}`
            };
        }

        const sceneNode = node as SceneNode;
        const width = "width" in sceneNode ? sceneNode.width : 0;
        const height = "height" in sceneNode ? sceneNode.height : 0;
        const childCount = "children" in sceneNode ? sceneNode.children.length : 0;
        const isLikelyScreenOrContainer = CONTAINER_TYPES.has(sceneNode.type) && childCount > 0;

        if (isLikelyScreenOrContainer && args.allowFrameExport !== true) {
            return {
                isError: true,
                content: `Refusing to export ${sceneNode.type} "${sceneNode.name}" (${sceneNode.id}) because it looks like a container/screen (${Math.round(width)}x${Math.round(height)}, ${childCount} children). Select the actual logo/icon/vector/image node, or call export-node with allowFrameExport=true if you intentionally want a full frame screenshot.`
            };
        }

        const requestedFormat = args.format || "PNG";
        const scale = Math.max(0.1, Math.min(args.scale || 1, 4));
        const imagePaint = getFirstVisibleImagePaint(sceneNode);

        // Fast path: if this node is an IMAGE fill and the caller wants a bitmap, download the original image bytes
        // instead of rendering a screenshot of the node. This is much faster and avoids status bars/frame chrome.
        if (imagePaint && (requestedFormat === "PNG" || requestedFormat === "JPG")) {
            const image = figma.getImageByHash(imagePaint.imageHash);
            if (image) {
                const bytes = await image.getBytesAsync();
                return {
                    isError: false,
                    content: {
                        id: sceneNode.id,
                        name: sceneNode.name,
                        type: sceneNode.type,
                        width,
                        height,
                        childCount,
                        format: requestedFormat,
                        scale,
                        source: "image-fill-original",
                        imageHash: imagePaint.imageHash,
                        byteLength: bytes.length,
                        bytesBase64: uint8ArrayToBase64(bytes)
                    }
                };
            }
        }

        const exportSettings: ExportSettings = {
            format: requestedFormat as any,
            suffix: "",
            constraint: {
                type: "SCALE",
                value: scale
            }
        };

        const uint8array = await sceneNode.exportAsync(exportSettings);

        return {
            isError: false,
            content: {
                id: sceneNode.id,
                name: sceneNode.name,
                type: sceneNode.type,
                width,
                height,
                childCount,
                format: requestedFormat,
                scale,
                source: "rendered-node",
                byteLength: uint8array.length,
                bytesBase64: uint8ArrayToBase64(uint8array)
            }
        };
    } catch (error) {
        return {
            isError: true,
            content: error instanceof Error ? error.message : String(error)
        };
    }
}

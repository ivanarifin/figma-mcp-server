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

function isScreenLikeContainer(node: SceneNode, width: number, height: number, childCount: number): boolean {
    if (!CONTAINER_TYPES.has(node.type) || childCount === 0) {
        return false;
    }

    // Sections are organizational/page-level containers, not assets.
    if (node.type === "SECTION") {
        return true;
    }

    const parentType = node.parent?.type;
    const isTopLevelCanvasNode = parentType === "PAGE";
    const isMobileScreenSized = width >= 300 && height >= 640;
    const isDesktopOrTabletScreenSized = width >= 640 && height >= 480;
    const isVeryLargeArtwork = width >= 900 || height >= 900;

    // Only block containers that look like full screens/artboards. Smaller grouped artwork,
    // logos, cards, wordmarks, and hero art frames should remain exportable.
    return isTopLevelCanvasNode && (isMobileScreenSized || isDesktopOrTabletScreenSized || isVeryLargeArtwork);
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
        const isBlockedScreenContainer = isScreenLikeContainer(sceneNode, width, height, childCount);

        if (isBlockedScreenContainer && args.allowFrameExport !== true) {
            return {
                isError: true,
                content: `Refusing to export ${sceneNode.type} "${sceneNode.name}" (${sceneNode.id}) because it looks like a top-level screen/artboard (${Math.round(width)}x${Math.round(height)}, ${childCount} children). Select a child artwork/logo/card node, or intentionally use allowFrameExport=true for full-screen screenshots.`
            };
        }

        const requestedFormat = args.format || "PNG";
        const scale = Math.max(0.1, Math.min(args.scale || 1, 4));

        // Use the known-stable rendered export path. Avoid figma.getImageByHash().getBytesAsync() by default,
        // because in plugin runtime it can hang on some imported/remote images and keep the MCP request running.
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

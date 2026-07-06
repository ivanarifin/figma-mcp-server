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

export async function exportNode(args: ExportNodeParams): Promise<ToolResult> {
    try {
        const node = await figma.getNodeByIdAsync(args.id);
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

        const format = args.format || "PNG";
        const scale = Math.max(0.1, Math.min(args.scale || 1, 4));

        const exportSettings: ExportSettings = {
            format: format as any,
            suffix: "",
            constraint: {
                type: "SCALE",
                value: scale
            }
        };

        const uint8array = await sceneNode.exportAsync(exportSettings);
        const byteArray = Array.from(uint8array);

        return {
            isError: false,
            content: {
                id: sceneNode.id,
                name: sceneNode.name,
                type: sceneNode.type,
                width,
                height,
                childCount,
                format: format,
                scale: scale,
                bytes: byteArray
            }
        };
    } catch (error) {
        return {
            isError: true,
            content: error instanceof Error ? error.message : String(error)
        };
    }
}

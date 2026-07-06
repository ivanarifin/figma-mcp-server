import type { ExportNodeParams } from "@shared/types";
import { ToolResult } from "../tool-result";

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

        const format = args.format || "PNG";
        const scale = Math.max(0.1, Math.min(args.scale || 1, 4));

        // Perform the export in Figma
        const exportSettings: ExportSettings = {
            format: format as any,
            suffix: "",
            constraint: {
                type: "SCALE",
                value: scale
            }
        };

        const uint8array = await (node as SceneNode).exportAsync(exportSettings);
        
        // Convert Uint8Array to regular number array to transfer over Socket.io comfortably as JSON
        const byteArray = Array.from(uint8array);

        return {
            isError: false,
            content: {
                id: node.id,
                name: node.name,
                format: format,
                scale: scale,
                // Sending the image as base64 or array. 
                // Let's send it as array. The MCP server can write it to disk or return it.
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

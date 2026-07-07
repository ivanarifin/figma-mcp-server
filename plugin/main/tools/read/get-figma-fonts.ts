import type { GetFigmaFontsParams } from "@shared/types";
import { ToolResult } from "../tool-result";

type FontKey = string;

interface FontUsage {
    family: string;
    style: string;
    count: number;
    textNodeIds: string[];
    sampleTexts: string[];
}

function fontKey(fontName: FontName): FontKey {
    return `${fontName.family}|||${fontName.style}`;
}

function getFontNamesFromTextNode(node: TextNode): FontName[] {
    const fonts = new Map<FontKey, FontName>();

    try {
        if (node.fontName !== figma.mixed) {
            fonts.set(fontKey(node.fontName), node.fontName);
            return Array.from(fonts.values());
        }
    } catch (_error) {
        // Fallback to range scan below.
    }

    const textLength = node.characters?.length ?? 0;
    if (textLength === 0) {
        return [];
    }

    // Scan ranges. This is more accurate for mixed-style text nodes, while still capped for performance.
    const maxCharsToScan = Math.min(textLength, 5000);
    for (let i = 0; i < maxCharsToScan; i++) {
        try {
            const rangeFont = node.getRangeFontName(i, i + 1);
            if (rangeFont !== figma.mixed) {
                fonts.set(fontKey(rangeFont), rangeFont);
            }
        } catch (_error) {
            // Ignore inaccessible range reads.
        }
    }

    return Array.from(fonts.values());
}

function addFontUsage(fonts: Map<FontKey, FontUsage>, fontName: FontName, node: TextNode) {
    const key = fontKey(fontName);
    const existing = fonts.get(key) || {
        family: fontName.family,
        style: fontName.style,
        count: 0,
        textNodeIds: [],
        sampleTexts: [],
    };

    existing.count += 1;
    if (!existing.textNodeIds.includes(node.id)) {
        existing.textNodeIds.push(node.id);
    }

    const sample = (node.characters || "").replace(/\s+/g, " ").trim();
    if (sample && existing.sampleTexts.length < 3 && !existing.sampleTexts.includes(sample)) {
        existing.sampleTexts.push(sample.slice(0, 120));
    }

    fonts.set(key, existing);
}

async function traverseFonts(node: BaseNode, depth: number, maxDepth: number, fonts: Map<FontKey, FontUsage>, stats: { textNodeCount: number; scannedNodeCount: number }) {
    stats.scannedNodeCount += 1;

    if (node.type === "TEXT") {
        const textNode = node as TextNode;
        stats.textNodeCount += 1;
        const fontNames = getFontNamesFromTextNode(textNode);
        for (const fontName of fontNames) {
            addFontUsage(fonts, fontName, textNode);
        }
    }

    if (depth >= maxDepth) {
        return;
    }

    if ("children" in node) {
        const children = (node as ChildrenMixin).children;
        for (const child of children) {
            await traverseFonts(child, depth + 1, maxDepth, fonts, stats);
        }
    }
}

export async function getFigmaFonts(args: GetFigmaFontsParams): Promise<ToolResult> {
    try {
        const normalizedId = args.nodeId.replace(/-/g, ":");
        const maxDepth = args.depth ?? 10;
        const node = await figma.getNodeByIdAsync(normalizedId);

        if (!node) {
            return {
                isError: true,
                content: `Node not found: ${normalizedId}`,
            };
        }

        if (node.type === "DOCUMENT") {
            return {
                isError: true,
                content: "Cannot scan fonts from DOCUMENT. Pass a page/frame/node id instead.",
            };
        }

        const fonts = new Map<FontKey, FontUsage>();
        const stats = { textNodeCount: 0, scannedNodeCount: 0 };
        await traverseFonts(node as BaseNode, 0, maxDepth, fonts, stats);

        const fontsUsed = Array.from(fonts.values()).sort((a, b) => {
            const familyCompare = a.family.localeCompare(b.family);
            if (familyCompare !== 0) return familyCompare;
            return a.style.localeCompare(b.style);
        });

        const families = Array.from(new Set(fontsUsed.map((font) => font.family))).sort();

        return {
            isError: false,
            content: {
                purpose: "Font inventory for Figma-to-code. This lists fonts used in the selected Figma node tree. Figma Plugin API exposes font metadata, not downloadable .ttf/.otf files.",
                requestedNodeId: normalizedId,
                maxDepth,
                scannedNodeCount: stats.scannedNodeCount,
                textNodeCount: stats.textNodeCount,
                fontCount: fontsUsed.length,
                families,
                fontsUsed,
                usageHints: [
                    "Use this to configure project fonts for React Native/web code generation.",
                    "This tool cannot download font files from Figma due to Figma API/licensing limitations.",
                    "For Google Fonts, download/install them separately. For paid/system fonts like Avenir, provide licensed font files manually."
                ],
            },
        };
    } catch (error) {
        return {
            isError: true,
            content: error instanceof Error ? error.message : String(error),
        };
    }
}

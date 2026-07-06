type SerializableNode = SceneNode | PageNode | DocumentNode;

interface SerializeOptions {
    recursive: boolean;
    maxDepth: number;
}

function isMixed(value: unknown): boolean {
    return value === figma.mixed;
}

function safeRead<T>(reader: () => T): T | undefined {
    try {
        const value = reader();
        return isMixed(value) ? undefined : value;
    } catch (_error) {
        return undefined;
    }
}

function rgbaToHex(color: RGB | RGBA, opacity?: number): string {
    const r = Math.round(color.r * 255).toString(16).padStart(2, "0");
    const g = Math.round(color.g * 255).toString(16).padStart(2, "0");
    const b = Math.round(color.b * 255).toString(16).padStart(2, "0");
    const alpha = "a" in color ? color.a : opacity;
    if (alpha === undefined || alpha >= 1) {
        return `#${r}${g}${b}`;
    }
    const a = Math.round(alpha * 255).toString(16).padStart(2, "0");
    return `#${r}${g}${b}${a}`;
}

function serializePaint(paint: Paint): any {
    const base: any = {
        type: paint.type,
        visible: paint.visible !== false,
        opacity: paint.opacity,
        blendMode: paint.blendMode,
    };

    if (paint.type === "SOLID") {
        return {
            ...base,
            color: rgbaToHex(paint.color, paint.opacity),
        };
    }

    if (paint.type === "IMAGE") {
        return {
            ...base,
            scaleMode: paint.scaleMode,
            imageHash: paint.imageHash,
        };
    }

    if (paint.type.startsWith("GRADIENT")) {
        const gradientPaint = paint as GradientPaint;
        return {
            ...base,
            gradientTransform: gradientPaint.gradientTransform,
            gradientStops: gradientPaint.gradientStops?.map((stop) => ({
                position: stop.position,
                color: rgbaToHex(stop.color),
            })),
        };
    }

    return base;
}

function serializePaints(paints: ReadonlyArray<Paint> | PluginAPI["mixed"] | undefined): any[] | undefined {
    if (!paints || isMixed(paints) || !Array.isArray(paints)) {
        return undefined;
    }
    return paints.map(serializePaint);
}

function serializeEffects(effects: ReadonlyArray<Effect> | PluginAPI["mixed"] | undefined): any[] | undefined {
    if (!effects || isMixed(effects) || !Array.isArray(effects)) {
        return undefined;
    }
    return effects.map((effect) => {
        const item: any = {
            type: effect.type,
            visible: effect.visible !== false,
            radius: "radius" in effect ? effect.radius : undefined,
            blendMode: "blendMode" in effect ? effect.blendMode : undefined,
        };
        if ("color" in effect && effect.color) {
            item.color = rgbaToHex(effect.color);
        }
        if ("offset" in effect) {
            item.offset = effect.offset;
        }
        if ("spread" in effect) {
            item.spread = effect.spread;
        }
        return item;
    });
}

function serializeExportSettings(settings: ReadonlyArray<ExportSettings> | undefined): any[] | undefined {
    if (!settings || !Array.isArray(settings) || settings.length === 0) {
        return undefined;
    }
    return settings.map((setting) => ({
        format: setting.format,
        suffix: setting.suffix,
        constraint: "constraint" in setting ? setting.constraint : undefined,
    }));
}

function addIfDefined(target: any, key: string, value: any) {
    if (value !== undefined && value !== null && !isMixed(value)) {
        target[key] = value;
    }
}

function serializeCompactNode(node: SerializableNode, options: SerializeOptions, depth: number, visited: Set<string>): any {
    if (visited.has(node.id)) {
        return { id: node.id, type: node.type, _circular: true };
    }
    visited.add(node.id);

    const anyNode = node as any;
    const result: any = {
        id: node.id,
        name: node.name,
        type: node.type,
    };

    addIfDefined(result, "visible", safeRead(() => anyNode.visible));
    addIfDefined(result, "locked", safeRead(() => anyNode.locked));

    // Bounds and transforms. These are the most important properties for code generation.
    addIfDefined(result, "x", safeRead(() => anyNode.x));
    addIfDefined(result, "y", safeRead(() => anyNode.y));
    addIfDefined(result, "width", safeRead(() => anyNode.width));
    addIfDefined(result, "height", safeRead(() => anyNode.height));
    addIfDefined(result, "absoluteBoundingBox", safeRead(() => anyNode.absoluteBoundingBox));
    addIfDefined(result, "absoluteRenderBounds", safeRead(() => anyNode.absoluteRenderBounds));
    addIfDefined(result, "rotation", safeRead(() => anyNode.rotation));
    addIfDefined(result, "opacity", safeRead(() => anyNode.opacity));

    // Layout / Auto Layout -> CSS flexbox mapping.
    addIfDefined(result, "layoutMode", safeRead(() => anyNode.layoutMode));
    addIfDefined(result, "layoutWrap", safeRead(() => anyNode.layoutWrap));
    addIfDefined(result, "primaryAxisAlignItems", safeRead(() => anyNode.primaryAxisAlignItems));
    addIfDefined(result, "counterAxisAlignItems", safeRead(() => anyNode.counterAxisAlignItems));
    addIfDefined(result, "primaryAxisSizingMode", safeRead(() => anyNode.primaryAxisSizingMode));
    addIfDefined(result, "counterAxisSizingMode", safeRead(() => anyNode.counterAxisSizingMode));
    addIfDefined(result, "layoutSizingHorizontal", safeRead(() => anyNode.layoutSizingHorizontal));
    addIfDefined(result, "layoutSizingVertical", safeRead(() => anyNode.layoutSizingVertical));
    addIfDefined(result, "layoutAlign", safeRead(() => anyNode.layoutAlign));
    addIfDefined(result, "layoutGrow", safeRead(() => anyNode.layoutGrow));
    addIfDefined(result, "itemSpacing", safeRead(() => anyNode.itemSpacing));
    addIfDefined(result, "counterAxisSpacing", safeRead(() => anyNode.counterAxisSpacing));
    addIfDefined(result, "paddingLeft", safeRead(() => anyNode.paddingLeft));
    addIfDefined(result, "paddingRight", safeRead(() => anyNode.paddingRight));
    addIfDefined(result, "paddingTop", safeRead(() => anyNode.paddingTop));
    addIfDefined(result, "paddingBottom", safeRead(() => anyNode.paddingBottom));
    addIfDefined(result, "clipContent", safeRead(() => anyNode.clipsContent));
    addIfDefined(result, "constraints", safeRead(() => anyNode.constraints));

    // Styling.
    addIfDefined(result, "fills", serializePaints(safeRead(() => anyNode.fills)));
    addIfDefined(result, "strokes", serializePaints(safeRead(() => anyNode.strokes)));
    addIfDefined(result, "strokeWeight", safeRead(() => anyNode.strokeWeight));
    addIfDefined(result, "strokeAlign", safeRead(() => anyNode.strokeAlign));
    addIfDefined(result, "strokeCap", safeRead(() => anyNode.strokeCap));
    addIfDefined(result, "strokeJoin", safeRead(() => anyNode.strokeJoin));
    addIfDefined(result, "dashPattern", safeRead(() => anyNode.dashPattern));
    addIfDefined(result, "effects", serializeEffects(safeRead(() => anyNode.effects)));
    addIfDefined(result, "cornerRadius", safeRead(() => anyNode.cornerRadius));
    addIfDefined(result, "topLeftRadius", safeRead(() => anyNode.topLeftRadius));
    addIfDefined(result, "topRightRadius", safeRead(() => anyNode.topRightRadius));
    addIfDefined(result, "bottomRightRadius", safeRead(() => anyNode.bottomRightRadius));
    addIfDefined(result, "bottomLeftRadius", safeRead(() => anyNode.bottomLeftRadius));
    addIfDefined(result, "blendMode", safeRead(() => anyNode.blendMode));

    // Text-specific data for code generation.
    if (node.type === "TEXT") {
        const textNode = node as TextNode;
        addIfDefined(result, "characters", safeRead(() => textNode.characters));
        addIfDefined(result, "fontName", safeRead(() => textNode.fontName));
        addIfDefined(result, "fontSize", safeRead(() => textNode.fontSize));
        addIfDefined(result, "fontWeight", safeRead(() => anyNode.fontWeight));
        addIfDefined(result, "lineHeight", safeRead(() => textNode.lineHeight));
        addIfDefined(result, "letterSpacing", safeRead(() => textNode.letterSpacing));
        addIfDefined(result, "textAlignHorizontal", safeRead(() => textNode.textAlignHorizontal));
        addIfDefined(result, "textAlignVertical", safeRead(() => textNode.textAlignVertical));
        addIfDefined(result, "textAutoResize", safeRead(() => textNode.textAutoResize));
        addIfDefined(result, "textCase", safeRead(() => textNode.textCase));
        addIfDefined(result, "textDecoration", safeRead(() => textNode.textDecoration));
        addIfDefined(result, "paragraphIndent", safeRead(() => textNode.paragraphIndent));
        addIfDefined(result, "paragraphSpacing", safeRead(() => textNode.paragraphSpacing));
    }

    // Component/instance data.
    addIfDefined(result, "componentPropertyDefinitions", safeRead(() => anyNode.componentPropertyDefinitions));
    addIfDefined(result, "componentProperties", safeRead(() => anyNode.componentProperties));
    addIfDefined(result, "exportSettings", serializeExportSettings(safeRead(() => anyNode.exportSettings)));

    if ("children" in node) {
        const children = safeRead(() => (node as ChildrenMixin).children) || [];
        result.childrenCount = children.length;
        if (options.recursive && depth < options.maxDepth) {
            result.children = children.map((child) => serializeCompactNode(child as SerializableNode, options, depth + 1, visited));
        } else if (children.length > 0) {
            result.children = children.map((child) => ({
                id: child.id,
                name: child.name,
                type: child.type,
            }));
            result.childrenTruncated = depth >= options.maxDepth;
        }
    }

    return result;
}

export function serializeNode(node: SerializableNode, visited: Set<string> = new Set(), recursive: boolean = false, maxDepth: number = 5): any {
    return serializeCompactNode(node, { recursive, maxDepth }, 0, visited);
}

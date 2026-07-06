import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { TaskResult } from "src/task-manager";

const MAX_TEXT_LENGTH = 180000;

function sanitizeForAi(value: any): any {
    if (Array.isArray(value)) {
        if (value.length > 0 && value.every((item) => typeof item === "number")) {
            return `[${value.length} bytes]`;
        }
        return value.map(sanitizeForAi);
    }

    if (value && typeof value === "object") {
        const output: any = {};
        for (const [key, childValue] of Object.entries(value)) {
            if (key === "bytes" || key === "imageData" || key === "data") {
                output[key] = Array.isArray(childValue) ? `[${childValue.length} bytes]` : "[binary data]";
            } else {
                output[key] = sanitizeForAi(childValue);
            }
        }
        return output;
    }

    return value;
}

function stringifyForAi(value: any): string {
    const text = JSON.stringify(sanitizeForAi(value));
    if (text.length <= MAX_TEXT_LENGTH) {
        return text;
    }

    return `${text.slice(0, MAX_TEXT_LENGTH)}\n...[truncated ${text.length - MAX_TEXT_LENGTH} chars; request a smaller node or lower maxDepth]`;
}

export async function safeToolProcessor<T>(task: Promise<TaskResult>): Promise<CallToolResult> {
    try {
        const result = await task;
        return {
            content: [{
                type: "text",
                text: stringifyForAi(result.content)
            }],
            isError: result.isError
        } as CallToolResult;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : stringifyForAi(error);
        return {
            content: [{
                type: "text",
                text: errorMessage
            }],
            isError: true
        } as CallToolResult;
    }

}

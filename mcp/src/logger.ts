import * as fs from "fs";
import * as path from "path";

function getLogFilePath(): string {
    return process.env.FIGMA_MCP_LOG_FILE || path.resolve(process.cwd(), ".figma-mcp-server.log");
}

function sanitize(value: any): any {
    if (typeof value === "string" && value.length > 1024 && /^[A-Za-z0-9+/=]+$/.test(value)) {
        return `[base64 ${value.length} chars]`;
    }

    if (Array.isArray(value)) {
        if (value.length > 0 && value.every((item) => typeof item === "number")) {
            return `[${value.length} bytes]`;
        }
        if (value.length > 50) {
            return `[array length=${value.length}]`;
        }
        return value.map(sanitize);
    }

    if (value && typeof value === "object") {
        const output: any = {};
        for (const [key, childValue] of Object.entries(value)) {
            if (["bytes", "imageData", "data"].includes(key)) {
                output[key] = Array.isArray(childValue) ? `[${childValue.length} bytes]` : "[binary data]";
            } else if (key === "bytesBase64") {
                output[key] = typeof childValue === "string" ? `[base64 ${childValue.length} chars]` : "[base64 data]";
            } else {
                output[key] = sanitize(childValue);
            }
        }
        return output;
    }

    return value;
}

export function logEvent(event: string, details: Record<string, any> = {}) {
    const logFilePath = getLogFilePath();
    const line = JSON.stringify({
        ts: new Date().toISOString(),
        pid: process.pid,
        event,
        ...sanitize(details),
    });

    try {
        fs.mkdirSync(path.dirname(logFilePath), { recursive: true });
        fs.appendFileSync(logFilePath, `${line}\n`, "utf8");
    } catch (error) {
        // Never break MCP stdio because logging failed.
        console.error("[figma-mcp logger] failed to write log", error instanceof Error ? error.message : String(error));
    }
}

export function getActiveLogFilePath(): string {
    return getLogFilePath();
}

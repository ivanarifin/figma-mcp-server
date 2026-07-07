const ONE_HOUR_MS = 60 * 60 * 1000;
const MIN_TIMEOUT_MS = 1000;
const MAX_TIMEOUT_MS = 24 * 60 * 60 * 1000;

function parseTimeoutMs(rawValue: string | undefined, fallbackMs: number): number {
    if (!rawValue) {
        return fallbackMs;
    }

    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallbackMs;
    }

    return Math.max(MIN_TIMEOUT_MS, Math.min(Math.floor(parsed), MAX_TIMEOUT_MS));
}

export function getDefaultTaskTimeoutMs(): number {
    return parseTimeoutMs(process.env.FIGMA_MCP_TASK_TIMEOUT_MS, ONE_HOUR_MS);
}

export function getReadTaskTimeoutMs(): number {
    return parseTimeoutMs(process.env.FIGMA_MCP_READ_TIMEOUT_MS, getDefaultTaskTimeoutMs());
}

export function getExportTaskTimeoutMs(): number {
    return parseTimeoutMs(process.env.FIGMA_MCP_EXPORT_TIMEOUT_MS, getDefaultTaskTimeoutMs());
}

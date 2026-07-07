import type { FromPluginMessage } from "@shared/types";
import type { Server } from "socket.io";

type SocketMessage = "start-task" | "task-finished" | "task-failed";

function summarizePayload(data: any): any {
    if (!data) return data;
    const content = data.content;
    const summary: any = {
        taskId: data.taskId,
        isError: data.isError,
        contentType: typeof content,
    };
    if (content && typeof content === "object") {
        summary.contentKeys = Object.keys(content);
        if (typeof content.bytesBase64 === "string") summary.bytesBase64 = `[base64 ${content.bytesBase64.length} chars]`;
        if (Array.isArray(content.bytes)) summary.bytes = `[${content.bytes.length} bytes]`;
        if (typeof content.name === "string") summary.name = content.name;
        if (typeof content.type === "string") summary.type = content.type;
        if (typeof content.source === "string") summary.source = content.source;
    } else if (typeof content === "string") {
        summary.contentPreview = content.slice(0, 200);
    }
    return summary;
}

// Socket manager is the abstraction layer on the top of the socket.io library.
// It receives messages from the Figma plugin and raises events for the orchestrator to handle.
// It also send messages to the Figma plugin.
export class SocketManager {
    constructor(server: Server) {
        this.server = server;

        this.server.on('connection', (socket) => {
            console.error(`[socket] Figma plugin/client connected: ${socket.id}`);

            socket.on('disconnect', (reason) => {
                console.error(`[socket] Figma plugin/client disconnected: ${socket.id} reason=${reason}`);
            });

            socket.on('task-finished', (data: FromPluginMessage) => {
                try {
                    console.error('[socket] task-finished', summarizePayload(data));
                    if (this._onTaskFinishedCallback) {
                        this._onTaskFinishedCallback(data);
                    }
                } catch (error) {
                    console.error('Error in task-finished handler:', error);
                }
            });
    
            socket.on('task-failed', (data: FromPluginMessage) => {
                try {
                    console.error('[socket] task-failed', summarizePayload(data));
                    if (this._onTaskErrorCallback) {
                        this._onTaskErrorCallback(data);
                    }
                } catch (error) {
                    console.error('Error in task-failed handler:', error);
                }
            });
        });
    }

    public sendMessage(message: SocketMessage, data: any): boolean {
        const sockets = this.server.sockets.sockets.size;
        console.error(`[socket] send ${message} command=${data?.command ?? ''} taskId=${data?.id ?? ''} connectedClients=${sockets}`);
        if (sockets === 0) {
            return false;
        }
        this.server.emit(message, data);
        return true;
    }

    private server: Server;

    // Events

    private _onTaskFinishedCallback?: (task: FromPluginMessage) => void;

    public onTaskFinished(callback: (task: FromPluginMessage) => void) {
        this._onTaskFinishedCallback = callback;
    }

    private _onTaskErrorCallback?: (task: FromPluginMessage) => void;
    public onTaskError(callback: (task: FromPluginMessage) => void) {
        this._onTaskErrorCallback = callback;
    }

}

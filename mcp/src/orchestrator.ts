import type { SocketManager } from "./socket-manager.js";
import type { TaskManager } from "./task-manager.js";
import { logEvent } from "./logger.js";

export class Orchestrator {

    constructor(socketManager: SocketManager, taskManager: TaskManager) {
        this.socketManager = socketManager;
        this.taskManager = taskManager;

        // Subscribe to task added events
        // Send start-task message via web socket to the Figma plugin
        this.taskManager.onTaskAdded((task) => {
            const sent = this.socketManager.sendMessage('start-task', task);
            if (!sent) {
                logEvent('task.no_connected_plugin', { taskId: task.id, command: task.command });
                this.taskManager.updateTask(
                    task.id,
                    {
                        error: "Figma plugin is not connected to MCP server. Open/reopen the Figma MCP Server plugin window, wait until it says Connected, then retry the tool call.",
                        command: task.command,
                    },
                    'failed'
                );
            }
        });


        // Subscribe to task finished events
        // Raise task completed event in the task manager on me
        this.socketManager.onTaskFinished((task) => {
            this.taskManager.updateTask(task.taskId, task.content, 'completed');
        });

        // Subscribe to task failed events
        // Raise task failed event in the task manager on message received
        this.socketManager.onTaskError((task) => {
            this.taskManager.updateTask(task.taskId, task.content, 'failed');
        });
    }

    private socketManager: SocketManager;
    private taskManager: TaskManager;

}

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { generateUUID } from "./utils.js";

type TaskStatus = "pending" | "in_progress" | "completed" | "failed" | "timed_out";

export interface TaskResult {
    isError: boolean;
    content?: any;
}

interface Task {
    id: string;
    command: string;
    args: any;
    status: TaskStatus;
    createdAt: Date;
    updatedAt: Date;
    resolve: (result: TaskResult) => void;
    reject: (result: TaskResult) => void;
    result: any;
    timeoutId?: ReturnType<typeof setTimeout>;
}

function sanitizeForLogs(value: any): any {
    if (Array.isArray(value)) {
        if (value.length > 0 && value.every((item) => typeof item === "number")) {
            return `[${value.length} bytes]`;
        }
        if (value.length > 50) {
            return `[array length=${value.length}]`;
        }
        return value.map(sanitizeForLogs);
    }

    if (value && typeof value === "object") {
        const output: any = {};
        for (const [key, childValue] of Object.entries(value)) {
            if (key === "bytes" || key === "imageData" || key === "data") {
                output[key] = Array.isArray(childValue) ? `[${childValue.length} bytes]` : "[binary data]";
            } else {
                output[key] = sanitizeForLogs(childValue);
            }
        }
        return output;
    }

    return value;
}

// Task manager is responsible for managing the tasks.
// Task could be added, updated and removed.
// Events are raised when a task is added or updated
export class TaskManager {
    private tasks: Task[] = [];


    public runTask<TResult, TArgs>(
        command: string,
        args: TArgs,
        timeoutMs: number = 60000): Promise<TResult> {
        const id = generateUUID();
        const promise = new Promise((resolve, reject) => {
            const task = this.addTask(id, command, args, resolve, reject);
            task.timeoutId = setTimeout(() => {
                this.updateTask(id, { error: "Task timed out" }, "timed_out");
            }, timeoutMs);
        });
        return promise as Promise<any>;
    }

    public addTask<TArgs>(id: string,
        command: string,
        args: TArgs,
        resolve: (result: any) => void,
        reject: (result: any) => void) {
        const task: Task = {
            id: id,
            command: command,
            args: args,
            status: 'pending',
            createdAt: new Date(),
            updatedAt: new Date(),
            resolve: resolve,
            reject: reject,
            result: null
        };
        this.tasks.push(task);
        // Call the onTaskAdded event if subscriber(s) exist
        if (typeof this._onTaskAddedCallback === "function") {
            this._onTaskAddedCallback(task);
        }
        return task;
    }

    private _onTaskAddedCallback?: (task: Task) => void;

    // Register a callback for when a task is added
    public onTaskAdded(callback: (task: Task) => void) {
        this._onTaskAddedCallback = callback;
    }

    private removeTask(id: string) {
        this.tasks = this.tasks.filter(task => task.id !== id);
    }

    public updateTask(id: string, result: any, status: TaskStatus) {

        const task = this.tasks.find(task => task.id === id);
        if (task) {
            if (task.status === 'completed'
                || task.status === 'failed'
                || task.status === 'timed_out') {
                if (task.status !== 'completed') {
                    console.error("Attempt to update task after it has been completed, failed or timed out", id, sanitizeForLogs(result), status);
                }
                return;
            }

            task.status = status;
            task.updatedAt = new Date();
        }
        else {
            console.error("Attempt to update task that does not exist", id, sanitizeForLogs(result), status);
            return;
        }

        if (task.timeoutId) {
            clearTimeout(task.timeoutId);
        }

        if (status === 'completed') {
            task?.resolve({
                isError: false,
                content: result,
            });
            this.removeTask(id);
        } else if (status === 'failed'
            || status === 'timed_out'
        ) {
            task?.resolve({
                isError: true,
                content: result,
            });
            this.removeTask(id);
        }
    }
}

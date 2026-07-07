import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getServer } from './server.js';
import { config, PORT } from './config.js';
import { Server } from 'socket.io';
import http from 'http';
import { getActiveLogFilePath, logEvent } from './logger.js';

export async function startSTDIO() {
    try {
        const httpServer = http.createServer();
        const socketServer = new Server(httpServer, {
            cors: {
                origin: "*",
                methods: ["GET", "POST", "OPTIONS"],
                allowedHeaders: ["*"],
                credentials: false
            },
            transports: ['polling', 'websocket'],
            allowUpgrades: true,
            cookie: false,
            serveClient: false,
            pingTimeout: 60000,
            pingInterval: 25000
        });
        
        logEvent('stdio.starting', { port: PORT, cwd: process.cwd(), logFile: getActiveLogFilePath() });
        const server = await getServer(socketServer);
        const transport = new StdioServerTransport();
        await server.connect(transport);
        
        // Start HTTP server for Socket.IO connections from Figma plugin
        httpServer.listen(PORT, () => {
            console.error(`Socket.IO server listening on http://localhost:${PORT}`);
            logEvent('stdio.listening', { port: PORT, cwd: process.cwd(), logFile: getActiveLogFilePath() });
        });
    } catch (error) {
        logEvent('stdio.start_error', { error: error instanceof Error ? error.message : String(error) });
        console.error('Error starting STDIO server:', error);
        throw error;
    }
}
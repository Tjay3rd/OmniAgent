import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { initWebSocketServer } from "./services/socket.service.js";

const app = express();
const server = createServer(app); // Wrap Express inside native HTTP server

// Mount the raw ws engine instance to the exact same server setup ports
const wss = new WebSocketServer({ server });
initWebSocketServer(wss);

server.listen(3000, () => {
	console.log("Multi-tenant HTTP & Native WS engine operational on port 3000");
});

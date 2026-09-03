import express from "express";
import { createServer, IncomingMessage } from "http";
import { WebSocketServer } from "ws";
import mongoose from "mongoose";
import cookieParser from "cookie-parser";
import cors from "cors";
import { parseCookie } from "cookie";
import helmet from "helmet";
import { Request, Response, NextFunction } from "express";
// Service & Router Core Hooks
import { initWebSocketServer } from "./services/socket.service.js";
import webhookRouter from "./routes/webhook.routes.js";
import adminRouter from "./routes/admin.routes.js";
import dashboardRouter from "./routes/dashboard.routes.js";
import billingRouter from "./routes/billing.routes.js";
// Environment Configuration Validation
import { env } from "./validation/env.zod.js";
import widgetRouter from "./routes/widget.routes.js";
import jwt from "jsonwebtoken";

const app = express();
const httpServer = createServer(app);
app.set("trust proxy", 1);

// 1. Initialize the WebSocket layer over the shared HTTP infrastructure
const wss = new WebSocketServer({ noServer: true });
initWebSocketServer(wss);

httpServer.on("upgrade", (request: IncomingMessage, socket, head) => {
	try {
		const { pathname } = new URL(request.url ?? "/", "http://localhost");

		if (pathname === "/dashboard") {
			return handleDashboardUpgrade(request, socket, head);
		}

		if (pathname === "/widget") {
			try {
				return wss.handleUpgrade(request, socket, head, (ws) => {
					wss.emit("connection", ws, request);
				});
			} catch (error) {
				socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
				socket.destroy();
			}
		}

		socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
		socket.destroy();
	} catch (error) {
		socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
		socket.destroy();
		return;
	}
});

const handleDashboardUpgrade = (request: IncomingMessage, socket: any, head: any) => {
	const cookies = parseCookie(request.headers.cookie || "");
	const token = cookies.accessToken;
	if (!token) {
		socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
		socket.destroy();
		return;
	}

	let payload: {
		id: string;
		tenantId: string;
		role: "owner" | "admin" | "agent";
		senderType?: "owner" | "admin" | "agent";
	} | null;

	try {
		payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as typeof payload;
		if (payload) payload.senderType = payload.role; // Ensure senderType is set for dashboard connections
	} catch (error) {
		socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
		socket.destroy();
		return;
	}

	wss.handleUpgrade(request, socket, head, (ws) => {
		// Attach the verified payload to the WebSocket instance
		(ws as any).agentId = payload?.id;
		(ws as any).tenantId = payload?.tenantId;
		(ws as any).connectionType = payload?.role; // "owner" | "admin" | "agent"
		(ws as any).senderType = payload?.role;

		wss.emit("connection", ws, request);
	});
};

// 2. standard security headers (CSP, HSTS, X-Content-Type-Options, etc.).
app.use(helmet());

// 3. Standard Cross-Origin Resource Sharing Rules
app.use(
	cors({
		origin: env.FRONTEND_URL,
		credentials: true,
	}),
);

// 4. MOUNT STRIPE WEBHOOK ROUTE FIRST.
// This ensures raw stream buffers are captured before global body-parsers parse the text stream
app.use("/api/webhooks", express.raw({ type: "application/json" }), webhookRouter);

// 5. Global Request Utility Parsers
app.use(express.json());
app.use(cookieParser());

// 6. System Route Matrix Registrations
app.use("/api/admin", adminRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/widget", widgetRouter);
app.use("/api/billing", billingRouter);

// 7. Centralized Production Error Capture Handler

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
	console.error("Centralized System Failure Captured:", err);

	const status = err.statusCode || 500;
	const isOperational = status >= 400 && status < 500;

	const responsePayload = {
		error: isOperational ? err.message : "An unexpected internal error occurred. " + "Please try again later.",
		...(env.NODE_ENV === "development" && { stack: err.stack }),
	};

	res.status(status).json(responsePayload);
});

// 8. Database Connection Guard & Startup Sequence
const startServer = async () => {
	try {
		mongoose.set("strictQuery", true);
		await mongoose.connect(env.MONGO_URI);
		console.log("Connected to MongoDB database instance successfully.");

		const PORT = env.PORT || 5000;
		httpServer.listen(PORT, () => {
			console.log(`[OmniAgent Engine V1 Active]: Listening over port channel ${PORT}`);
		});
	} catch (initError) {
		console.error("Critical Engine Boot Failure: Unable to establish core connections.", initError);
		process.exit(1);
	}
};

startServer();

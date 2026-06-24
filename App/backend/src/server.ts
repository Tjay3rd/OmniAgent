import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import mongoose from "mongoose";
import cookieParser from "cookie-parser";
import cors from "cors";
// Service & Router Core Hooks
import { initWebSocketServer } from "./services/socket.service.js";
import webhookRouter from "./routes/webhook.routes.js";
import adminRouter from "./routes/admin.routes.js";
import dashboardRouter from "./routes/dashboard.routes.js";
// Environment Configuration Validation
import { env } from "./validation/env.zod.js";

const app = express();
const httpServer = createServer(app);
app.set("trust proxy", 1);

// 1. Initialize the WebSocket layer over the shared HTTP infrastructure
const wss = new WebSocketServer({ server: httpServer });
initWebSocketServer(wss);

// 2. Standard Cross-Origin Resource Sharing Rules
app.use(
	cors({
		origin: env.FRONTEND_URL || "http://localhost:3000",
		credentials: true,
	}),
);

// 3. MOUNT STRIPE WEBHOOK ROUTE FIRST
// This ensures raw stream buffers are captured before global body-parsers parse the text stream
app.use("/api/webhooks", webhookRouter);

// 4. Global Request Utility Parsers
app.use(express.json());
app.use(cookieParser());

// 5. System Route Matrix Registrations
app.use("/api/admin", adminRouter);
app.use("/api/dashboard", dashboardRouter);

// 6. Centralized Production Error Capture Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
	console.error("Centralized System Failure Captured:", err);

	const status = err.statusCode || 500;
	const responsePayload = {
		error: err.message || "An unexpected system internal exception occurred.",
		...(env.NODE_ENV === "development" && { stack: err.stack }),
	};

	res.status(status).json(responsePayload);
});

// 7. Database Connection Guard & Startup Sequence
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

import { Request, Response, NextFunction } from "express";
import AgentConfig from "../models/agentConfig.model.js";

export const updateAgentConfig = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
	try {
		// req.user is verified by requireAuth and checked via restrictTo(["owner"])
		if (!req.user) {
			return res.status(401).json({ error: "Unauthenticated" });
		}

		const { systemPrompt, temperature, modelProvider, modelName, isActive } = req.body;

		// Perform an atomic upsert operation (updates existing configuration or creates it if missing)
		const config = await AgentConfig.findOneAndUpdate(
			{ tenantId: req.user.tenantId },
			{
				$set: {
					...(systemPrompt && { systemPrompt: systemPrompt.trim() }),
					...(temperature !== undefined && { temperature }),
					...(modelProvider && { modelProvider }),
					...(modelName && { modelName }),
					...(isActive !== undefined && { isActive }),
				},
			},
			{ new: true, upsert: true, runValidators: true },
		);

		return res.status(200).json({
			message: "AI Agent workspace guidelines synchronized successfully.",
			config,
		});
	} catch (error) {
		next(error);
	}
};

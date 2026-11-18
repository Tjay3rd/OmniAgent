import { PDFParse } from "pdf-parse";
import { Request, Response, NextFunction } from "express";
import { enqueueIndexing } from "../queues/indexing.queue.js";
import KnowledgeSource from "../models/knowledgeSource.model.js";

export const uploadContextDocs = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
	try {
		//1. get the file, title and the tenantId for filtering from the client
		const tenantId = req?.user?.tenantId || "6aa166db184f89064a41a5df"; // from JWT middleware dummy tenantId for testing
		const title = req.body.title?.trim();
		const file = req.file;

		if (!tenantId) return res.status(401).json({ error: "Unathorized! Tenant Id is missing" });
		if (!title) return res.status(400).json({ error: "Document title is missing" });
		if (!file) return res.status(400).json({ error: "No file uploaded" });

		//2. make sure its a valid file type (PDF or Text) using multer middleware and pdf-parser
		let rawText = "";
		if (file?.mimetype === "application/pdf") {
			const parser = new PDFParse({ data: file.buffer });
			try {
				rawText = (await parser.getText()).text;
			} finally {
				await parser.destroy();
			}
		} else if (file?.mimetype === "text/plain") {
			rawText = file.buffer.toString("utf-8");
		} else {
			return res.status(415).json({ error: "Only PDF or Text files allowed" });
		}

		if (!rawText) {
			return res.status(422).json({ error: "No text found in file" });
		}

		//3. create a new knowledge source record in the database with status "queued" and enqueue the indexing job
		const source = await KnowledgeSource.create({ tenantId, title });

		await enqueueIndexing({
			tenantId,
			sourceId: source.id,
			title,
			text: rawText,
		});

		return res.status(202).json({ sourceId: source.id, status: "queued" });
	} catch (error) {
		next(error);
	}
};

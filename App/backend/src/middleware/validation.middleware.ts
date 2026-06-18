import { NextFunction, Request, Response } from "express";

interface Error {
	validation: String;
	code: String;
	message: String;
	path: string[];
}

export const validate = (schema: any) => (req: Request, res: Response, next: NextFunction) => {
	const result = schema.safeParse(req.body);

	if (!result.success) {
		const errors = result.error.issues.map((i: Error) => ({
			field: i.path.join("."),
			message: i.message,
		}));
		return res.status(422).json({ error: "Validation errors", errors });
	}

	req.body = result.data;
	next();
};

import { Resend } from "resend";
import { WELCOME_EMAIL_TEMPLATE } from "./email_template.js";
import { env } from "../validation/env.zod.js";

const resend = new Resend(env.RESEND_API_KEY);

export async function sendWelcomeEmail(userEmail: string, name: string) {
	try {
		const { data, error } = await resend.emails.send({
			from: `Omniagentdeck Team - <noreply@${env.EMAIL_FROM}>`,
			to: [userEmail],
			subject: "Welcome email",
			html: WELCOME_EMAIL_TEMPLATE.replace("{name}", name),
		});

		if (error) throw new Error("Error sending welcome email", error as ErrorOptions);

		console.log("Email sent sucessfully", data);
	} catch (error: any) {
		console.error("Error sending welcome email", error);
		return { error: true, message: error.message || error };
	}
}

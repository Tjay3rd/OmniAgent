export const WELCOME_EMAIL_TEMPLATE = `
<!doctype html>
<html lang="en">
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<title>Welcome to OmniAgent</title>
	</head>
	<body
		style="
			font-family: Arial, sans-serif;
			line-height: 1.6;
			color: #333;
			max-width: 600px;
			margin: 0 auto;
			padding: 20px;
		"
	>
		<div style="background: linear-gradient(to right, #4caf50, #45a049); padding: 20px; text-align: center">
			<h1 style="color: white; margin: 0">Welcome To OmniAgent, {name}</h1>
		</div>
		<div
			style="
				background-color: #f9f9f9;
				padding: 20px;
				border-radius: 0 0 5px 5px;
				box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
			"
		>
			<div style="max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #dddddd; border-radius: 8px">
				<p>Hi {name},</p>
				<p>Welcome aboard! We're thrilled to have you join the <strong>OmniAgent</strong> community.</p>
				<p>
					OmniAgent gives your business AI-powered customer support at a price that makes sense, with no dev team
					required. Your customers get fast, accurate answers around the clock, and you get your time back.
				</p>
				<div style="margin-top: 30px; padding: 15px; background-color: #f4f4f4; border-radius: 4px">
					<h2 style="color: #555555; font-size: 18px; margin-top: 0">🚀 What to do next:</h2>
					<ul style="list-style-type: none; padding: 0">
						<li style="margin-bottom: 10px">
							<strong>1. Set up your first agent:</strong>
							Head to your
							<a href="[Dashboard Link]" style="color: #45a049; text-decoration: none; font-weight: bold">
								OmniAgent dashboard
							</a>
							and give your support agent a name.
						</li>
						<li style="margin-bottom: 10px">
							<strong>2. Teach it your business:</strong>
							Add your FAQs, policies, and product info so your agent answers like a member of your team.
						</li>
						<li style="margin-bottom: 0">
							<strong>3. Go live:</strong>
							Put your agent in front of customers and let it handle the repetitive questions while you focus on
							growing.
						</li>
					</ul>
				</div>
				<p style="margin-top: 30px">
					If you ever get stuck or have a suggestion, our support team is just an email away at
					<a href="mailto:[Support Email Address]" style="color: #45a049; text-decoration: none">
						[Support Email Address] </a
					>.
				</p>
				<p>Here's to happier customers!</p>
				<p style="margin-top: 20px">
					Best regards,<br />
					The OmniAgent Team
				</p>
				<div
					style="
						margin-top: 40px;
						padding-top: 10px;
						border-top: 1px solid #eeeeee;
						text-align: center;
						font-size: 12px;
						color: #999999;
					"
				>
					<p>
						<a href="[Your Website/App Link]" style="color: #999999; text-decoration: none"> OmniAgent Website </a>
						|
						<a href="[Unsubscribe Link]" style="color: #999999; text-decoration: none"> Unsubscribe </a>
					</p>
					<div style="text-align: center; margin-top: 20px; color: #888; font-size: 12px">
						<p>This is an automated message, please do not reply to this email.</p>
					</div>
				</div>
			</div>
		</div>
	</body>
</html>

`;

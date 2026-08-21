// app/(authenticated)/dashboard/settings/widget/page.tsx
"use client";

import { useState } from "react";
import { useTenant } from "@/hooks/useTenant"; // however you access the logged-in tenant

export default function WidgetSettingsPage() {
	const { tenant } = useTenant();
	const [copied, setCopied] = useState(false);

	const embedCode = `<script src="https://${process.env.NEXT_PUBLIC_API_URL}/api/widget/script.js" data-tenant-id="${tenant?._id}"></script>`;

	const handleCopy = () => {
		navigator.clipboard.writeText(embedCode);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<div className="space-y-2">
			<p className="text-sm text-zinc-400">
				Paste this snippet into your website, right before the closing &lt;/body&gt; tag.
			</p>
			<pre className="bg-zinc-900 p-3 rounded-lg text-xs overflow-x-auto">{embedCode}</pre>
			<button onClick={handleCopy}>{copied ? "Copied!" : "Copy code"}</button>
		</div>
	);
}

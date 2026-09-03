// app/(authenticated)/dashboard/settings/widget/page.tsx
"use client";

import { useEffect, useState } from "react";
import { api } from "../../../../lib/api";
import axios from "axios";

export default function WidgetSettingsPage() {
	const [tenantId, setTenantId] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const getTenantId = async () => {
			try {
				const response = await api.get("/api/widget/getTenantId");
				setTenantId(response.data?.tenantId || null);
			} catch (error) {
				const message = axios.isAxiosError(error) ? error?.response?.data.error : "An unexpected error occurred.";
				setError(message);
			}
		};

		getTenantId();
	}, []);

	const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
	const embedCode = tenantId
		? `<script src="${apiUrl}/api/widget/script.js" data-tenant-id="${tenantId}"></script>`
		: "Loading...";

	const handleCopy = () => {
		navigator.clipboard.writeText(embedCode);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<div className="space-y-2">
			<p className="text-sm text-zinc-400">
				Paste the snippet into your website, right before the closing &lt;/body&gt; tag.
			</p>
			{tenantId ? (
				<>
					<pre className="bg-zinc-900 p-3 rounded-lg text-xs overflow-x-auto">{embedCode}</pre>
					<button onClick={handleCopy} disabled={!tenantId}>
						{copied ? "Copied!" : "Copy code"}
					</button>
				</>
			) : (
				<p className="text-sm text-zinc-500">Loading your workspace…</p>
			)}
			{error && <p className="text-red-500 text-sm">{error}</p>}
		</div>
	);
}

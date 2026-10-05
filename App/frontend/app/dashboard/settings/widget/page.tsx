// app/(authenticated)/dashboard/settings/widget/page.tsx
"use client";

import { useEffect, useState } from "react";
import { api } from "../../../../lib/api";
import axios from "axios";
import { AgentConfigForm } from "./AgentConfigFormComponent";

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

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(embedCode);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			setError("Could not copy the snippet. Select the code and copy it manually.");
		}
	};

	const defaultValues = {
		modelName: "gemini-3.1-flash-lite",
		temperature: 0.3,
		systemPrompt: "You are a customer support agent",
		isActive: true,
	} as const;

	return (
		<div className="space-y-2">
			{/*1.WIDGET TENANT ID*/}
			<p className="text-sm text-zinc-700">
				Paste the snippet into your website, right before the closing &lt;/body&gt; tag.
			</p>
			{tenantId ? (
				<>
					<pre className="bg-zinc-400 p-3 rounded-lg text-xs overflow-x-auto">{embedCode}</pre>
					<button onClick={handleCopy} disabled={!tenantId}>
						{copied ? "Copied!" : "Copy code"}
					</button>
				</>
			) : (
				<p className="text-sm text-zinc-500">Loading your workspace…</p>
			)}
			{error && <p className="text-red-500 text-sm">{error}</p>}

			{/*AI CONFIG SETTINGS INPUT */}

			{tenantId && <AgentConfigForm tenantId={tenantId} defaultValues={defaultValues} />}
		</div>
	);
}

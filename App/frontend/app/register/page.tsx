"use client";

import React, { useState } from "react";
import { useAuthActions } from "../../hooks/useAuthActions";
import { api } from "../../lib/api";
import axios from "axios";
import Link from "next/link";
import { Check } from "lucide-react";
import { Tier } from "@/types/nextTypes";

const TIERS: {
	id: Tier;
	name: string;
	price: string;
	tagline: string;
	features: string[];
}[] = [
	{
		id: "free",
		name: "Free Trial",
		price: "$0",
		tagline: "Free forever, no card required",
		features: ["100 chat threads", "Standard AI runtime", "Community support"],
	},
	{
		id: "starter",
		name: "Starter Core",
		price: "$49/mo",
		tagline: "For growing teams",
		features: ["1,000 active chat threads", "Standard Vercel AI agent runtime", "Next.js 16 embedded client widget"],
	},
	{
		id: "production",
		name: "Omni Production",
		price: "$149/mo",
		tagline: "Full-throttle agent workflows",
		features: [
			"Unlimited structural sessions",
			"Custom vector database search (RAG)",
			"Advanced tool-calling architectures",
		],
	},
];

export default function RegisterPage() {
	const { register, isRegistering, registerError } = useAuthActions();

	const [companyName, setCompanyName] = useState("");
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [subdomain, setSubdomain] = useState("");
	const [selectedTier, setSelectedTier] = useState<Tier>("free");
	const [checkoutError, setCheckoutError] = useState<string | null>(null);
	const [redirecting, setRedirecting] = useState(false);

	const PRICE_ID_MAP: Record<Exclude<Tier, "free">, string | undefined> = {
		starter: process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER,
		production: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRODUCTION,
	};

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		setCheckoutError(null);

		// 1. Register always runs first — creates the tenant and owner account regardless of tier chosen.
		//    The backend decides trial vs inactive based on    the `plan` field we send.
		register(
			{
				companyName,
				name,
				email,
				password,
				subdomain: subdomain.toLowerCase().trim(),
				plan: selectedTier,
			},
			{
				onSuccess: async () => {
					// 2. Free tier needs nothing further — the backend already activated the trial.
					if (selectedTier === "free") {
						window.location.href = "/dashboard";
						return;
					}

					// 3. Paid tiers: immediately kick off Checkout, same endpoint the billing page already uses.
					setRedirecting(true);
					try {
						const priceId = PRICE_ID_MAP[selectedTier];
						const { data } = await api.post("/api/billing/checkout", { priceId });

						if (data.url) {
							window.location.href = data.url;
						} else {
							throw new Error("Checkout session failed to initialize.");
						}
					} catch (err) {
						const message = axios.isAxiosError(err) ? err.response?.data?.message : undefined;
						setCheckoutError(
							message || "Account created, but checkout could not start. You can subscribe later from Billing.",
						);
						setRedirecting(false);
					}
				},
			},
		);
	};

	return (
		<div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4 text-white">
			<div className="w-full max-w-3xl rounded-xl border border-zinc-800 bg-zinc-900 p-8 shadow-2xl">
				<h2 className="mb-2 text-2xl font-bold tracking-tight">Deploy your OmniAgent Workspace</h2>
				<p className="mb-6 text-sm text-zinc-400">Setup your corporate tenant container and owner profile.</p>

				{(registerError || checkoutError) && (
					<div className="mb-4 rounded-lg bg-red-950/50 border border-red-900/50 p-3 text-sm text-red-400">
						{registerError || checkoutError}
					</div>
				)}

				{/* TIER SELECTOR */}
				<div className="mb-6">
					<label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">
						Choose your plan
					</label>
					<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
						{TIERS.map((tier) => {
							const isSelected = selectedTier === tier.id;
							return (
								<button
									key={tier.id}
									type="button"
									onClick={() => setSelectedTier(tier.id)}
									className={`text-left rounded-lg border p-4 transition ${
										isSelected ? "border-blue-500 bg-blue-950/20" : "border-zinc-800 bg-zinc-950 hover:border-zinc-700"
									}`}
								>
									<div className="flex items-center justify-between mb-1">
										<span className="text-sm font-semibold text-zinc-100">{tier.name}</span>
										{isSelected && <Check className="h-4 w-4 text-blue-500" />}
									</div>
									<span className="text-lg font-bold text-white">{tier.price}</span>
									<p className="text-[11px] text-zinc-500 mt-1 mb-2">{tier.tagline}</p>
									<ul className="space-y-1">
										{tier.features.map((feature) => (
											<li key={feature} className="text-[11px] text-zinc-400">
												{feature}
											</li>
										))}
									</ul>
								</button>
							);
						})}
					</div>
				</div>

				<hr className="border-zinc-800 mb-6" />

				<form onSubmit={handleSubmit} className="space-y-4">
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<div>
							<label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
								Company Legal Name
							</label>
							<input
								type="text"
								value={companyName}
								onChange={(e) => setCompanyName(e.target.value)}
								required
								className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-sm text-white focus:border-blue-500 focus:outline-none transition"
								placeholder="Logistics Corp"
							/>
						</div>

						<div>
							<label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
								Requested Subdomain
							</label>
							<div className="flex items-center rounded-lg border border-zinc-800 bg-zinc-950 focus-within:border-blue-500 transition">
								<input
									type="text"
									value={subdomain}
									onChange={(e) => setSubdomain(e.target.value.replace(/[^a-zA-Z0-9-]/g, ""))}
									required
									className="w-full bg-transparent p-3 text-sm text-white focus:outline-none"
									placeholder="logistics"
								/>
								<span className="bg-zinc-900 px-3 py-3 text-sm font-medium text-zinc-500 border-l border-zinc-800 rounded-r-lg">
									.omniagent.com
								</span>
							</div>
						</div>
					</div>

					<div>
						<label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
							Full Administrator Name
						</label>
						<input
							type="text"
							value={name}
							onChange={(e) => setName(e.target.value)}
							required
							className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-sm text-white focus:border-blue-500 focus:outline-none transition"
							placeholder="John Doe"
						/>
					</div>

					<div>
						<label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
							Corporate Email Address
						</label>
						<input
							type="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							required
							className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-sm text-white focus:border-blue-500 focus:outline-none transition"
							placeholder="admin@company.com"
						/>
					</div>

					<div>
						<label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
							Master Access Password
						</label>
						<input
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							required
							className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-sm text-white focus:border-blue-500 focus:outline-none transition"
							placeholder="Minimum 8 characters"
						/>
					</div>

					<button
						type="submit"
						disabled={isRegistering || redirecting}
						className="w-full rounded-lg bg-blue-600 p-3 text-sm font-medium text-white hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-500 transition duration-200 mt-4"
					>
						{isRegistering
							? "Provisioning Workspace..."
							: redirecting
								? "Redirecting to Checkout..."
								: selectedTier === "free"
									? "Start Free Trial"
									: "Create Tenant & Continue to Payment"}
					</button>
				</form>

				<p className="mt-4 text-center text-xs text-zinc-500">
					Already managing a workspace?{" "}
					<Link href="/login" className="text-blue-500 hover:underline">
						Log in here
					</Link>
				</p>
			</div>
		</div>
	);
}

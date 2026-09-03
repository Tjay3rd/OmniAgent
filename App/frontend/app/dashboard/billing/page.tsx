"use client";

import { useState, Suspense } from "react";
import { CreditCard, Check, Zap, Loader2 } from "lucide-react";
import axios from "axios";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { api } from "../../../lib/api";
import { Tier } from "../../../types/nextTypes";

interface SubscriptionData {
	subscriptionId: string | null;
	priceId: string | null;
	status: "active" | "trialing" | "past_due" | "unpaid" | "inactive" | "cancelling";
	plan: Tier;
	currentPeriodEnd: string | null;
}

function SubscriptionBadge({
	status,
	subLoading,
}: {
	status: SubscriptionData["status"] | undefined;
	subLoading: boolean;
}) {
	if (subLoading) {
		return (
			<span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900 px-2.5 py-1	text-[10px] font-mono text-zinc-500">
				<Loader2 className="h-3 w-3 animate-spin" />
				Checking plan...
			</span>
		);
	}

	const resolved = status ? STATUS_BADGE_MAP[status] : STATUS_BADGE_MAP.inactive;

	return (
		<span
			className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-mono ${resolved.className}`}
		>
			{resolved.label}
		</span>
	);
}

function customerPlan(subscription: SubscriptionData) {
	return subscription?.plan === "free"
		? "Free Forever"
		: subscription?.plan === "starter"
			? "Starter Core"
			: subscription?.plan === "production"
				? "Omni Production"
				: "Unknown Plan";
}

function SubscriptionSummary({
	subscription,
	loading,
	onManage,
}: {
	subscription: SubscriptionData;
	loading: boolean;
	onManage: () => void;
}) {
	const planName = customerPlan(subscription);

	const statusInfo = STATUS_MESSAGES[subscription.status];
	const periodEndDate = subscription.currentPeriodEnd
		? new Date(subscription.currentPeriodEnd).toLocaleDateString()
		: null;

	return (
		<div
			className={`rounded-xl border p-6 space-y-4 ${
				statusInfo.urgent ? "border-red-900/50 bg-red-950/10" : "border-zinc-900 bg-zinc-900/20"
			}`}
		>
			<div className="flex items-center justify-between">
				<div>
					<h3 className="text-lg font-semibold text-zinc-100">{planName}</h3>
					{periodEndDate && (
						<p className="text-xs text-zinc-500 mt-0.5">
							{subscription.status === "cancelling" ? `Access ends ${periodEndDate}` : `Renews ${periodEndDate}`}
						</p>
					)}
				</div>
				<SubscriptionBadge status={subscription.status} subLoading={false} />
			</div>

			<p className={`text-xs leading-relaxed ${statusInfo.urgent ? "text-red-400" : "text-zinc-400"}`}>
				{statusInfo.message}
			</p>

			<button
				onClick={onManage}
				disabled={loading}
				className={`w-full text-center py-2.5 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-2 disabled:opacity-50 ${
					statusInfo.urgent ? "bg-red-600 hover:bg-red-500 text-white" : "bg-blue-600 hover:bg-blue-500 text-white"
				}`}
			>
				{loading ? (
					<>
						<Loader2 className="h-3.5 w-3.5 animate-spin" />
						Opening Portal...
					</>
				) : (
					statusInfo.actionLabel
				)}
			</button>
		</div>
	);
}

const STATUS_BADGE_MAP: Record<SubscriptionData["status"], { label: string; className: string }> = {
	active: {
		label: "Active",
		className: "bg-emerald-950/40 border-emerald-900/50 text-emerald-400",
	},
	trialing: {
		label: "Trial",
		className: "bg-blue-950/40 border-blue-900/50 text-blue-400",
	},
	past_due: {
		label: "Payment Past Due",
		className: "bg-amber-950/40 border-amber-900/50 text-amber-400",
	},
	unpaid: {
		label: "Payment Failed",
		className: "bg-red-950/40 border-red-900/50 text-red-400",
	},
	cancelling: {
		label: "Cancels at Period End",
		className: "bg-amber-950/40 border-amber-900/50 text-amber-400",
	},
	inactive: {
		label: "No Active Plan",
		className: "bg-zinc-900 border-zinc-800 text-zinc-500",
	},
};

const STATUS_MESSAGES: Record<SubscriptionData["status"], { message: string; actionLabel: string; urgent: boolean }> = {
	active: {
		message: "Your plan renews automatically each month.",
		actionLabel: "Manage Subscription",
		urgent: false,
	},
	trialing: {
		message: "You're in your trial period — no charge.",
		actionLabel: "Manage Subscription",
		urgent: false,
	},
	cancelling: {
		message: "Your plan is set to cancel at the end of the current period.",
		actionLabel: "Manage Subscription",
		urgent: false,
	},
	past_due: {
		message: "Your last payment failed. Update your payment method to avoid losing access.",
		actionLabel: "Update Payment Method",
		urgent: true,
	},
	unpaid: {
		message: "Payment has failed multiple times. Update your payment method now to restore access.",
		actionLabel: "Update Payment Method",
		urgent: true,
	},
	inactive: {
		message: "",
		actionLabel: "",
		urgent: false,
	},
};

function BillingContent() {
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const searchParams = useSearchParams();
	const checkoutSuccess = searchParams.get("success") === "true";
	const checkoutCanceled = searchParams.get("canceled") === "true";

	const { data: subscription, isLoading: subLoading } = useQuery({
		queryKey: ["billing", "subscription"],
		queryFn: async function fetchSubscription(): Promise<SubscriptionData> {
			const { data } = await api.get("/api/billing/subscription");
			return data;
		},
		refetchInterval: (query) => {
			const stillInactive = !Boolean(query.state.data?.priceId) && query.state.data?.status === "inactive";
			return checkoutSuccess && stillInactive ? 1500 : false;
		},
	});

	const currentPriceId = subscription?.priceId;
	const hasPlan = subscription?.priceId && subscription.status !== "inactive";
	const HEALTHY_STATUSES: SubscriptionData["status"][] = ["active", "trialing", "cancelling"];

	const isStarterActive =
		currentPriceId === process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER &&
		HEALTHY_STATUSES.includes(subscription?.status ?? "inactive");

	const isProductionActive =
		currentPriceId === process.env.NEXT_PUBLIC_STRIPE_PRICE_PRODUCTION &&
		HEALTHY_STATUSES.includes(subscription?.status ?? "inactive");

	const handleUpgrade = async (planKey: string) => {
		setLoading(true);
		setError(null);

		try {
			// 1. Hit your Express backend to generate the hosted Stripe checkout session
			const response = await api.post("/api/billing/checkout", { planKey });

			// 2. Extract the secure hosted URL returned from Stripe via your backend
			const { url } = response.data;

			if (url) {
				// 3. Break out of your app environment and redirect them straight to Stripe
				window.location.href = url;
			} else {
				throw new Error("Stripe checkout session initialization failed.");
			}
		} catch (error) {
			console.error("Stripe redirection failure:", error);
			const errorMessage = axios.isAxiosError(error) ? error.response?.data?.message : undefined;
			setError(errorMessage || "Could not launch payment gateway.");
			setLoading(false);
		}
	};

	const handleManageSubscription = async () => {
		setLoading(true);
		setError(null);

		try {
			const { data } = await api.post("/api/billing/portal", {});

			if (data.url) {
				window.location.href = data.url;
			} else {
				throw new Error("Could not open billing portal.");
			}
		} catch (err) {
			const message = axios.isAxiosError(err) ? err.response?.data?.message : undefined;
			setError(message || "Could not open billing portal.");
			setLoading(false);
		}
	};

	return (
		<div className="min-h-screen bg-zinc-950 text-zinc-200 p-8 font-sans antialiased">
			<div className="max-w-4xl mx-auto space-y-8">
				{/* HEADER SECTION */}
				<div>
					<h1 className="text-2xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
						<CreditCard className="h-5 w-5 text-blue-500" /> Workspace Billing
					</h1>
					<p className="text-sm text-zinc-400 mt-1">
						Manage your subscription tier, volume limits, and corporate deployment mechanics.
					</p>
					<div className="mt-3">
						<SubscriptionBadge status={subscription?.status} subLoading={subLoading} />
					</div>
				</div>

				{checkoutSuccess && (
					<div className="p-3 text-xs bg-emerald-950/40 border border-emerald-900/50 rounded-lg text-emerald-400">
						Payment successful — your plan is being activated.
					</div>
				)}

				{checkoutCanceled && (
					<div className="p-3 text-xs bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-400">
						Checkout was canceled. No changes were made to your plan.
					</div>
				)}

				{error && (
					<div className="p-3 text-xs bg-red-950/40 border border-red-900/50 rounded-lg text-red-400">{error}</div>
				)}

				{subLoading ? (
					<div className="text-xs text-zinc-500"> Loading billing info...</div>
				) : hasPlan ? (
					<SubscriptionSummary
						subscription={subscription!}
						loading={loading}
						onManage={() => handleManageSubscription()}
					/>
				) : (
					/* PRICING CARD MATRIX */
					<div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
						{/* TIER 1: STARTER */}
						<div className="rounded-xl border border-zinc-900 bg-zinc-900/20 p-6 flex flex-col justify-between space-y-6">
							<div className="space-y-2">
								<span className="text-[10px] uppercase font-mono tracking-wider text-zinc-500">Standard Pack</span>
								<h3 className="text-lg font-semibold text-zinc-100">Starter Core</h3>
								<p className="text-xs text-zinc-400 leading-relaxed">
									Perfect for growing setups requiring foundational automated AI support streams.
								</p>
								<div className="pt-2">
									<span className="text-3xl font-bold text-white">$49</span>
									<span className="text-xs text-zinc-500"> / month</span>
								</div>
							</div>
							<ul className="space-y-2 text-xs text-zinc-400 border-t border-zinc-900 pt-4">
								<li className="flex items-center gap-2">
									<Check className="h-3.5 w-3.5 text-blue-500" /> 1,000 active chat threads
								</li>
								<li className="flex items-center gap-2">
									<Check className="h-3.5 w-3.5 text-blue-500" /> Standard Vercel AI agent runtime
								</li>
								<li className="flex items-center gap-2">
									<Check className="h-3.5 w-3.5 text-blue-500" /> Next.js 16 embedded client widget
								</li>
							</ul>

							<button
								onClick={() => handleUpgrade("starter_monthly")}
								disabled={loading || subLoading || isStarterActive}
								className="w-full text-center py-2.5 rounded-lg text-xs	font-medium bg-zinc-900 border border-zinc-800	text-zinc-300 hover:bg-zinc-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
							>
								{isStarterActive ? "Current Plan" : loading ? "Redirecting..." : "Choose Starter Core"}
							</button>
						</div>

						{/* TIER 2: SCALE (THE UPGRADE TARGET) */}
						<div className="rounded-xl border border-blue-900/40 bg-zinc-900/40 p-6 flex flex-col justify-between space-y-6 relative overflow-hidden shadow-lg shadow-blue-950/20">
							<div className="absolute top-3 right-3 bg-blue-500/10 border border-blue-500/20 rounded-full px-2 py-0.5 text-[9px] font-mono font-medium text-blue-400 flex items-center gap-1">
								<Zap className="h-2.5 w-2.5 fill-blue-400" /> POPULAR
							</div>

							<div className="space-y-2">
								<span className="text-[10px] uppercase font-mono tracking-wider text-blue-400">Scale System</span>
								<h3 className="text-lg font-semibold text-zinc-100">Omni Production</h3>
								<p className="text-xs text-zinc-400 leading-relaxed">
									Full-throttle agent workflows featuring tool execution calls and sub-second socket pipelines.
								</p>
								<div className="pt-2">
									<span className="text-3xl font-bold text-white">$149</span>
									<span className="text-xs text-zinc-500"> / month</span>
								</div>
							</div>

							<ul className="space-y-2 text-xs text-zinc-400 border-t border-zinc-900 pt-4">
								<li className="flex items-center gap-2">
									<Check className="h-3.5 w-3.5 text-blue-400" /> Unlimited structural sessions
								</li>
								<li className="flex items-center gap-2">
									<Check className="h-3.5 w-3.5 text-blue-400" /> Custom vector database search maps (RAG)
								</li>
								<li className="flex items-center gap-2">
									<Check className="h-3.5 w-3.5 text-blue-400" /> Advanced tool-calling model architectures
								</li>
							</ul>

							<button
								onClick={() => handleUpgrade("pro_monthly")}
								disabled={loading || subLoading || isProductionActive}
								className="w-full text-center py-2.5 rounded-lg text-xs	font-semibold bg-blue-600 hover:bg-blue-500 text-white transition flex items-center justify-center gap-2	disabled:bg-zinc-800 disabled:text-zinc-500	shadow-md shadow-blue-500/10"
							>
								{isProductionActive ? (
									"Current Plan"
								) : loading ? (
									<>
										<Loader2 className="h-3.5 w-3.5 animate-spin" />
										Provisioning Checkout Gateway...
									</>
								) : (
									"Upgrade to Production Tier"
								)}
							</button>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

export default function BillingPage() {
	return (
		<div className="min-h-screen bg-zinc-950 text-zinc-200 p-8 font-sans antialiased">
			<Suspense fallback={<div className="max-w-4xl mx-auto text-xs text-zinc-500">Loading billing info...</div>}>
				<BillingContent />
			</Suspense>
		</div>
	);
}

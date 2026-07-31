"use client";

import Link from "next/link";
import { ArrowRight, Bot, ShieldCheck, Zap, Code, Cpu } from "lucide-react";

export default function LandingPage() {
	return (
		<div className="min-h-screen bg-zinc-950 text-zinc-50 flex flex-col antialiased selection:bg-blue-500/30 selection:text-blue-200">
			{/* 1. STICKY BLUR NAVIGATION HEADER */}
			<header className="sticky top-0 z-50 w-full border-b border-zinc-800/60 bg-zinc-950/70 backdrop-blur-md transition-all">
				<div className="container max-w-7xl mx-auto flex h-16 items-center justify-between px-4 sm:px-6">
					<div className="flex items-center gap-2">
						<div className="h-8 w-8 rounded-lg bg-linear-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
							<Bot className="h-5 w-5 text-white" />
						</div>
						<span className="text-xl font-bold tracking-tight bg-linear-to-r from-white to-zinc-400 bg-clip-text text-transparent">
							OmniAgent
						</span>
					</div>

					<nav className="hidden md:flex items-center gap-8 text-sm font-medium text-zinc-400">
						<a href="#services" className="hover:text-zinc-100 transition-colors">
							Services
						</a>
						<a href="#features" className="hover:text-zinc-100 transition-colors">
							Platform
						</a>
						<a href="#partners" className="hover:text-zinc-100 transition-colors">
							Enterprise
						</a>
					</nav>

					<div className="flex items-center gap-4">
						<Link
							href="/login"
							className="text-sm font-medium text-zinc-400 hover:text-zinc-100 transition-colors px-3 py-2"
						>
							Console Login
						</Link>
						<Link
							href="/register"
							className="inline-flex h-9 items-center justify-center rounded-lg bg-zinc-100 px-4 text-sm font-medium text-zinc-950 shadow transition-colors hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-300"
						>
							Deploy Free Workspace
						</Link>
					</div>
				</div>
			</header>

			{/* 2. HERO IMPACT SECTION */}
			<section className="relative flex-1 flex flex-col items-center justify-center text-center px-4 pt-24 pb-20 overflow-hidden">
				{/* Subtle Background Radial Glow */}
				<div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-125 h-125 bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" />

				<div className="container max-w-4xl mx-auto space-y-6 relative z-10">
					<div className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-xs text-zinc-400 backdrop-blur">
						<span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
						Next.js 16 Multi-Tenant Architecture Live
					</div>

					<h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl bg-linear-to-b from-white via-zinc-200 to-zinc-500 bg-clip-text text-transparent max-w-3xl mx-auto leading-[1.15]">
						Autonomous Customer Workflows. Built for B2B Scale.
					</h1>

					<p className="max-w-xl mx-auto text-base sm:text-lg text-zinc-400 leading-relaxed">
						Instantly deploy containerized support engines featuring seamless AI agent streaming, multi-tenant workspace
						isolation, and automated human handoff loops.
					</p>

					<div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
						<Link
							href="/register"
							className="w-full sm:w-auto inline-flex h-11 items-center justify-center rounded-lg bg-blue-600 px-6 font-medium text-white shadow-lg shadow-blue-500/20 transition-colors hover:bg-blue-500 focus:outline-none group"
						>
							Get Started
							<ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
						</Link>
						<a
							href="#services"
							className="w-full sm:w-auto inline-flex h-11 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/40 px-6 font-medium text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-zinc-100"
						>
							Explore Solutions
						</a>
					</div>
				</div>
			</section>

			{/* 3. CORE SERVICES & BENTO FEATURES GRID */}
			<section id="services" className="border-t border-zinc-900 bg-zinc-950 px-4 py-24 sm:px-6 relative">
				<div className="container max-w-7xl mx-auto space-y-12">
					<div className="text-center max-w-2xl mx-auto space-y-3">
						<h2 className="text-2xl font-bold tracking-tight sm:text-3xl text-zinc-100">
							Engineered for Modern Enterprise Operations
						</h2>
						<p className="text-sm sm:text-base text-zinc-400">
							Everything required to scale real-time operations, perfectly balanced between automation and human
							oversight.
						</p>
					</div>

					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 pt-6">
						{/* Service Card 1 */}
						<div className="rounded-xl border border-zinc-900 bg-zinc-900/20 p-6 space-y-4 hover:border-zinc-800 transition duration-200">
							<div className="h-10 w-10 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-blue-400 shadow-inner">
								<Cpu className="h-5 w-5" />
							</div>
							<h3 className="text-lg font-semibold text-zinc-200">Token-Streaming AI</h3>
							<p className="text-sm text-zinc-400 leading-relaxed">
								Provide instant sub-second conversational replies directly to clients with asynchronous streaming
								models.
							</p>
						</div>

						{/* Service Card 2 */}
						<div className="rounded-xl border border-zinc-900 bg-zinc-900/20 p-6 space-y-4 hover:border-zinc-800 transition duration-200">
							<div className="h-10 w-10 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-indigo-400 shadow-inner">
								<ShieldCheck className="h-5 w-5" />
							</div>
							<h3 className="text-lg font-semibold text-zinc-200">Multi-Tenant Isolation</h3>
							<p className="text-sm text-zinc-400 leading-relaxed">
								Strict database and subdomain routing layer partitioning ensuring customer data structures never
								overlap.
							</p>
						</div>

						{/* Service Card 3 */}
						<div className="rounded-xl border border-zinc-900 bg-zinc-900/20 p-6 space-y-4 hover:border-zinc-800 transition duration-200">
							<div className="h-10 w-10 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-amber-400 shadow-inner">
								<Zap className="h-5 w-5" />
							</div>
							<h3 className="text-lg font-semibold text-zinc-200">Unified Sockets Engine</h3>
							<p className="text-sm text-zinc-400 leading-relaxed">
								Native WebSockets manage instant human agent takeover alerts and live dashboard updates without page
								reloads.
							</p>
						</div>

						{/* Service Card 4: Developer Integration (Using Code) */}
						<div className="rounded-xl border border-zinc-900 bg-zinc-900/20 p-6 space-y-4 hover:border-zinc-800 transition duration-200 lg:col-span-3">
							<div className="flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">
								<div className="space-y-2 max-w-xl">
									<div className="h-10 w-10 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-emerald-400 shadow-inner mb-2">
										<Code className="h-5 w-5" />
									</div>
									<h3 className="text-lg font-semibold text-zinc-200">Programmable Widget Hub</h3>
									<p className="text-sm text-zinc-400 leading-relaxed">
										Drop our lightweight client script onto any web property. Custom customer identification metadata
										seamlessly maps back to your siloed tenant workspace via Next.js 16.
									</p>
								</div>
								<div className="w-full md:w-auto bg-zinc-950 border border-zinc-800 rounded-lg p-4 font-mono text-xs text-zinc-400 shadow-2xl">
									<span className="text-blue-400">&lt;script</span> <span className="text-yellow-400">src</span>=
									<span className="text-emerald-400">&quot;https://cdn.omniagent.com/widget.js&quot;</span>{" "}
									<span className="text-yellow-400">data-tenant</span>=
									<span className="text-emerald-400">&quot;YOUR_ID&quot;</span>
									<span className="text-blue-400">&gt;&lt;/script&gt;</span>
								</div>
							</div>
						</div>
					</div>
				</div>
			</section>

			{/* 4. TRUSTED REPUTABLE COMPANIES LOGO BAR */}
			<section id="partners" className="border-t border-zinc-900 bg-zinc-950/40 px-4 py-16 text-center">
				<div className="container max-w-7xl mx-auto space-y-6">
					<p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
						Powering Ops Across Scale Teams
					</p>
					<div className="flex flex-wrap items-center justify-center gap-10 md:gap-16 opacity-40 grayscale contrast-200 pt-2">
						<span className="text-xl font-bold tracking-tight text-white font-mono">Vercel</span>
						<span className="text-xl font-bold tracking-tight text-white font-mono">MongoDB</span>
						<span className="text-xl font-bold tracking-tight text-white font-mono">Stripe</span>
						<span className="text-xl font-bold tracking-tight text-white font-mono">Supabase</span>
					</div>
				</div>
			</section>

			{/* 5. METRIC BLUR FOOTER */}
			<footer className="mt-auto border-t border-zinc-900 bg-zinc-950 px-4 py-12 sm:px-6">
				<div className="container max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6 text-sm text-zinc-500">
					<div className="flex items-center gap-2">
						<Bot className="h-4 w-4 text-zinc-400" />
						<span className="font-semibold text-zinc-400">OmniAgent, Inc.</span>
						<span>© 2026. All rights reserved.</span>
					</div>

					<div className="flex items-center gap-6">
						<span className="text-zinc-600">Contact: support@omniagent.com</span>
						<a href="#" className="hover:text-zinc-400 transition-colors">
							Privacy Policy
						</a>
						<a href="#" className="hover:text-zinc-400 transition-colors">
							Terms of Service
						</a>
					</div>
				</div>
			</footer>
		</div>
	);
}

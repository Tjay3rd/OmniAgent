"use client";

import React, { useState } from "react";
import { useAuthActions } from "../../hooks/useAuthActions.js";

export default function LoginPage() {
	const { login, isLoggingIn, loginError } = useAuthActions();

	// We only track the individual form fields locally before submission
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		// Simply fire the React Query mutation engine
		login({ email, password });
	};

	return (
		<div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4 text-white">
			<div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-8 shadow-2xl">
				<h2 className="mb-2 text-2xl font-bold tracking-tight">Access your Workspace</h2>
				<p className="mb-6 text-sm text-zinc-400">Enter your operational console credentials.</p>

				{/* Display custom network errors straight from React Query */}
				{loginError && (
					<div className="mb-4 rounded-lg bg-red-950/50 border border-red-900/50 p-3 text-sm text-red-400">
						{loginError}
					</div>
				)}

				<form onSubmit={handleSubmit} className="space-y-4">
					<div>
						<label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
							Business Email Address
						</label>
						<input
							type="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							required
							className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-sm text-white focus:border-blue-500 focus:outline-none transition"
							placeholder="name@company.com"
						/>
					</div>

					<div>
						<label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
							Security Access Password
						</label>
						<input
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							required
							className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-sm text-white focus:border-blue-500 focus:outline-none transition"
							placeholder="••••••••"
						/>
					</div>

					<button
						type="submit"
						disabled={isLoggingIn}
						className="w-full rounded-lg bg-blue-600 p-3 text-sm font-medium text-white hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-500 transition duration-200 mt-2"
					>
						{isLoggingIn ? "Authenticating Session..." : "Secure Login"}
					</button>
				</form>
			</div>
		</div>
	);
}

"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode, useState } from "react";

export default function QueryProvider({ children }: { children: ReactNode }) {
	// Using useState guarantees that Next.js doesn't recreate the cache client on re-renders
	const [queryClient] = useState(
		() =>
			new QueryClient({
				defaultOptions: {
					queries: {
						staleTime: 1000 * 60 * 5, // Cache data for 5 minutes before background refetching
						retry: 1, // Fail fast on network dropouts to improve user snappiness
						refetchOnWindowFocus: false,
					},
				},
			}),
	);

	return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

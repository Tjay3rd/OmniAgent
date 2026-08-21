import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import QueryProvider from "@/providers/queryProvider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
	title: "OmniAgent Console",
	description: "B2B Agentic Customer Support Hub",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="en" className="h-full bg-zinc-950">
			<body className={`${inter.className}  h-full antialiased`}>
				<QueryProvider>{children}</QueryProvider>
			</body>
		</html>
	);
}

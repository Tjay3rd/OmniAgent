"use client";

import { NativeSocketProvider } from "@/providers/nativeSocketProvider";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
	return <NativeSocketProvider>{children}</NativeSocketProvider>;
}

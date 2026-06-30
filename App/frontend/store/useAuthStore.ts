import { create } from "zustand";

interface UserProfile {
	id: string;
	name: string;
	email: string;
	role: "owner" | "admin" | "agent";
}

interface TenantWorkspace {
	_id: string;
	companyName: string;
	subdomain: string;
	subscriptionStatus: string;
}

interface AuthState {
	user: UserProfile | null;
	tenant: TenantWorkspace | null;
	isAuthenticated: boolean;
	setAuth: (user: UserProfile, tenant: TenantWorkspace) => void;
	clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
	user: null,
	tenant: null,
	isAuthenticated: false,

	setAuth: (user, tenant) => set({ user, tenant, isAuthenticated: true }),
	clearAuth: () => set({ user: null, tenant: null, isAuthenticated: false }),
}));

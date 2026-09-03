import { useMutation } from "@tanstack/react-query";
import { api } from "../lib/api"; // The interceptor client we mapped out previously
import { useAuthStore } from "../store/useAuthStore";
import { useRouter } from "next/navigation";
import { AxiosError } from "axios";
import { Tier } from "@/types/nextTypes";

// Form Submission Type Schemas
type RegisterInput = {
	companyName: string;
	name: string;
	email: string;
	password: string;
	subdomain: string;
	plan: Tier;
};

type LoginInput = {
	email: string;
	password: string;
};

interface BackendErrorResponse {
	error: string;
}

//Custom hook that combines our Axios instance, React Query mutations, and our Zustand store updates.
export const useAuthActions = () => {
	const setAuth = useAuthStore((state) => state.setAuth);
	const clearAuth = useAuthStore((state) => state.clearAuth);
	const router = useRouter();

	// A. REGISTER MUTATION ENGINE
	const registerMutation = useMutation({
		mutationFn: async (data: RegisterInput) => {
			const response = await api.post("/api/admin/register", data);
			return response.data; // This returns the { user, tenant, message } payload from your backend
		},
		onSuccess: (data) => {
			// Hydrate your global Zustand state cleanly in one line
			setAuth(data.user, data.tenant);
		},
	});

	// B. LOGIN MUTATION ENGINE
	const loginMutation = useMutation({
		mutationFn: async (data: LoginInput) => {
			const response = await api.post("/api/admin/login", data);
			return response.data;
		},
		onSuccess: (data) => {
			setAuth(data.user, data.tenant);
			router.push("/dashboard");
		},
	});

	// C. LOGOUT MUTATION ENGINE
	const logoutMutation = useMutation({
		mutationFn: async () => {
			await api.post("/api/admin/logout");
		},
		onSuccess: () => {
			clearAuth();
			router.push("/login");
		},
	});

	const regError = registerMutation.error as AxiosError<BackendErrorResponse>;
	const logError = loginMutation.error as AxiosError<BackendErrorResponse>;

	return {
		register: registerMutation.mutate,
		isRegistering: registerMutation.isPending,
		registerError: regError?.response?.data?.error || regError?.message || null,

		login: loginMutation.mutate,
		isLoggingIn: loginMutation.isPending,
		loginError: logError?.response?.data?.error || logError?.message || null,

		logout: logoutMutation.mutate,
	};
};

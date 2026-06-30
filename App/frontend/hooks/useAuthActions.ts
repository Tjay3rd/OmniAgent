import { useMutation } from "@tanstack/react-query";
import { api } from "../lib/api.js"; // The interceptor client we mapped out previously
import { useAuthStore } from "../store/useAuthStore.js";
import { useRouter } from "next/navigation";

// Form Submission Type Schemas
type RegisterInput = {
	companyName: string;
	name: string;
	email: string;
	password: string;
	subdomain: string;
};

type LoginInput = {
	email: string;
	password: string;
};

//Custom hook that combines our Axios instance, React Query mutations, and our Zustand store updates.
export const useAuthActions = () => {
	const setAuth = useAuthStore((state) => state.setAuth);
	const clearAuth = useAuthStore((state) => state.clearAuth);
	const router = useRouter();

	// A. REGISTER MUTATION ENGINE
	const registerMutation = useMutation({
		mutationFn: async (data: RegisterInput) => {
			const response = await api.post("/admin/register", data);
			return response.data; // This returns the { user, tenant, message } payload from your backend
		},
		onSuccess: (data) => {
			// Hydrate your global Zustand state cleanly in one line
			setAuth(data.user, data.tenant);

			// Route the fresh owner straight into their operational workspace console
			router.push("/dashboard");
		},
	});

	// B. LOGIN MUTATION ENGINE
	const loginMutation = useMutation({
		mutationFn: async (data: LoginInput) => {
			const response = await api.post("/admin/login", data);
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
			await api.post("/admin/logout");
		},
		onSuccess: () => {
			clearAuth();
			router.push("/login");
		},
	});

	return {
		register: registerMutation.mutate,
		isRegistering: registerMutation.isPending,
		registerError: (registerMutation.error as any)?.response?.data?.error || null,

		login: loginMutation.mutate,
		isLoggingIn: loginMutation.isPending,
		loginError: (loginMutation.error as any)?.response?.data?.error || null,

		logout: logoutMutation.mutate,
	};
};

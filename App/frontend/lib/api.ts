import axios from "axios";
import { toast } from "react-hot-toast";

interface FailedRequest {
	reject: (error: unknown) => void;
	resolve: () => void;
}

export const api = axios.create({
	baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000",
	timeout: 10000, // 10 seconds
	withCredentials: true, // Crucial for sending and receiving httpOnly cookies
	headers: {
		"Content-Type": "application/json",
	},
});

// Flag to prevent concurrent refresh loops if multiple requests fail at once
let isRefreshing = false;
let failedQueue: FailedRequest[] = [];

const processQueue = (error: unknown) => {
	failedQueue.forEach((prom) => {
		if (error) {
			prom.reject(error);
		} else {
			prom.resolve();
		}
	});
	failedQueue = [];
};

api.interceptors.response.use(
	(response) => response,
	async (error) => {
		const originalRequest = error.config;

		// If the error is a 401 and we haven't retried this request yet
		if (error.response?.status === 401 && !originalRequest._retry) {
			if (isRefreshing) {
				return new Promise<void>((resolve, reject) => {
					failedQueue.push({ resolve, reject });
				})
					.then(() => api(originalRequest))
					.catch((err) => Promise.reject(err));
			}

			originalRequest._retry = true;
			isRefreshing = true;

			try {
				// Hit your token rotation endpoint on the backend
				await api.post("/api/admin/refresh", {});

				processQueue(null);
				return api(originalRequest);
			} catch (refreshError) {
				processQueue(refreshError);
				// If the refresh token family is dead or expired, boot them to login
				window.location.href = "/login";
				return Promise.reject(refreshError);
			} finally {
				isRefreshing = false;
			}
		}

		if (error.response) {
			// Global handler for generic backend failures
			if (error.response.status === 500) {
				toast.error("Internal Server Error. Please try again later.");
			}
			if (error.response.status === 403) {
				toast.error("You do not have permission to perform this action.");
			}
		}

		return Promise.reject(error);
	},
);

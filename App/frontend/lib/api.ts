import axios from "axios";

interface FailedRequest {
	resolve: (token: string) => void;
	reject: (error: unknown) => void;
}

export const api = axios.create({
	baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api",
	withCredentials: true, // Crucial for sending and receiving httpOnly cookies
	headers: {
		"Content-Type": "application/json",
	},
});

// Flag to prevent concurrent refresh loops if multiple requests fail at once
let isRefreshing = false;
let failedQueue: FailedRequest[] = [];

const processQueue = (error: unknown, token: string | null = null) => {
	failedQueue.forEach((prom) => {
		if (error) {
			prom.reject(error);
		} else if (token) {
			prom.resolve(token);
		} else {
			prom.reject(new Error("Failed to refresh token"));
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
				return new Promise((resolve, reject) => {
					failedQueue.push({ resolve, reject });
				})
					.then(() => api(originalRequest))
					.catch((err) => Promise.reject(err));
			}

			originalRequest._retry = true;
			isRefreshing = true;

			try {
				// Hit your token rotation endpoint on the backend
				await axios.post(`${api.defaults.baseURL}/admin/refresh`, {}, { withCredentials: true });

				processQueue(null);
				return api(originalRequest);
			} catch (refreshError) {
				processQueue(refreshError, null);
				// If the refresh token family is dead or expired, boot them to login
				window.location.href = "/login";
				return Promise.reject(refreshError);
			} finally {
				isRefreshing = false;
			}
		}

		return Promise.reject(error);
	},
);

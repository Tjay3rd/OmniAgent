import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
	/* config options here */
	turbopack: {
		root: path.join(here, "..", ".."),
	},
};

export default nextConfig;

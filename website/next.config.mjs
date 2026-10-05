/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export: the whole site is HTML + JS + baked JSON. There is no
  // server, no API route, no database, and nothing for Vercel to run at
  // request time — it serves files from the edge.
  output: "export",
  reactStrictMode: true,
  images: { unoptimized: true },
  // Datasets are large JSON imports; keep them out of the server bundle paths.
  experimental: {
    optimizePackageImports: [],
  },
};

export default nextConfig;

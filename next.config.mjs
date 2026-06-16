/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  /**
   * Root URL serves the Operations dashboard. `beforeFiles` runs the
   * rewrite ahead of the filesystem lookup so `/` resolves to the
   * Operations content while the URL bar stays at `/`.
   */
  async rewrites() {
    return {
      beforeFiles: [{ source: "/", destination: "/operations" }],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;

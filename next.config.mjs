/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  /**
   * sharp ships native bindings; webpack-bundling them for the Vercel
   * serverless target drops the platform-specific `.node` binaries.
   * Externalising tells Next.js to treat sharp as a normal runtime
   * Node module and load the correct linux-x64 binary at boot.
   */
  serverExternalPackages: ["sharp"],

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

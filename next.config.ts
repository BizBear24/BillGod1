import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pglite ships WASM/native assets it reads from disk at runtime — keep it
  // out of the server bundle so those files resolve correctly.
  // exceljs is CommonJS and pulls in Node stream/zip internals; bundling it
  // breaks those requires, so it stays external and is loaded at runtime.
  serverExternalPackages: ["@electric-sql/pglite", "exceljs"],
  // An unrelated lockfile higher up in the user's home directory confuses
  // Turbopack's workspace-root detection; pin it to this project explicitly.
  experimental: {
    // Product imports post a spreadsheet through a Server Action; the default
    // 1MB body limit cuts off a realistic catalogue.
    serverActions: { bodySizeLimit: "12mb" },
  },
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;

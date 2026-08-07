import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // unpdf / pdfjs for serverless PDF text extraction (Vercel)
  serverExternalPackages: ["unpdf", "pdf-parse", "@napi-rs/canvas"],
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;

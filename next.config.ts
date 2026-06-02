import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  serverExternalPackages: ["pdfkit", "pdf-lib"]
};

export default nextConfig;
// Forzar reinicio para cargar nuevas variables de entorno

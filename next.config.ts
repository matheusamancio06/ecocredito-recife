import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

// Política de conteúdo: só o próprio site, mais os blocos de mapa do OpenStreetMap.
// 'unsafe-inline' é necessário porque o Next injeta scripts e estilos inline.
// Em desenvolvimento a política não é aplicada (o hot reload usa eval e websocket).
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://tile.openstreetmap.org",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Câmera (leitura do QR Code) e localização (mapa) só para o próprio site.
  { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=()" },
  ...(isProduction
    ? [
        { key: "Content-Security-Policy", value: contentSecurityPolicy },
        { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
      ]
    : []),
];

const nextConfig: NextConfig = {
  // Postgres embutido (WASM) e driver do Postgres gerenciado rodam como pacotes
  // externos no servidor, sem passar pelo empacotador.
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  experimental: {
    // Fotos são reduzidas no navegador (~300 KB), mas deixamos folga para o formulário.
    serverActions: { bodySizeLimit: "8mb" },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

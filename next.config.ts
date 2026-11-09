import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A fonte dos relatórios em PDF é lida do disco em tempo de execução
  // (lib/pdf/*.tsx); sem isto ela não vai para o deploy.
  outputFileTracingIncludes: {
    "/api/auditorias/**": ["./lib/pdf/fonts/*.ttf"],
    "/api/historico/**": ["./lib/pdf/fonts/*.ttf"],
    "/api/requisicoes/**": ["./lib/pdf/fonts/*.ttf"],
  },
  // Endereços antigos levam ao DiaCheck, mantendo o caminho. Só esses hosts:
  // as prévias de cada deploy (*.vercel.app com outro nome) e o desenvolvimento
  // local seguem como estão. Temporário (307) para não ficar preso no navegador.
  async redirects() {
    return ["checklist-kenkyo.vercel.app", "checklist.kenkyo.com.br"].map((host) => ({
      source: "/:path*",
      has: [{ type: "host" as const, value: host }],
      destination: "https://diacheck.app.br/:path*",
      permanent: false,
    }));
  },
};

export default nextConfig;

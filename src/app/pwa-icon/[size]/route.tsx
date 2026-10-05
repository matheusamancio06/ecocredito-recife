import { ImageResponse } from "next/og";

const SIZES: Record<string, number> = { "192": 192, "512": 512 };

// Ícone gerado sob demanda (sem arquivos binários no repositório). O fundo
// ocupa todo o quadrado e o texto fica na área segura, então serve também
// como ícone "maskable".
export async function GET(_request: Request, context: RouteContext<"/pwa-icon/[size]">) {
  const { size } = await context.params;
  const px = SIZES[size];
  if (!px) return new Response("Não encontrado", { status: 404 });

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#94c044",
          color: "#23310d",
          fontSize: px * 0.4,
          fontWeight: 800,
          letterSpacing: -2,
        }}
      >
        EC
      </div>
    ),
    { width: px, height: px },
  );
}

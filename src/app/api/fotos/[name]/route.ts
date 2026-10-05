import { getCurrentUser } from "@/lib/auth";
import { canViewPhoto } from "@/lib/repo";
import { readImage } from "@/lib/uploads";

const DEMO_NAME = /^demo-(ANTES|DEPOIS)$/;

const HEADERS = {
  "Cache-Control": "private, max-age=3600",
  "X-Content-Type-Options": "nosniff",
};

// Os registros simulados não têm foto real: devolvemos uma imagem indicativa.
function demoPlaceholder(kind: string): Response {
  const isAfter = kind === "DEPOIS";
  const label = isAfter ? "Local limpo" : "Entulho";
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">` +
    `<rect width="400" height="300" fill="${isAfter ? "#e8f3d3" : "#ececec"}"/>` +
    `<text x="200" y="140" font-family="sans-serif" font-size="26" font-weight="700" text-anchor="middle" fill="#23310d">${label}</text>` +
    `<text x="200" y="176" font-family="sans-serif" font-size="16" text-anchor="middle" fill="#5b6a48">Foto simulada</text></svg>`;
  return new Response(svg, { headers: { ...HEADERS, "Content-Type": "image/svg+xml" } });
}

export async function GET(_request: Request, context: RouteContext<"/api/fotos/[name]">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Não autenticado", { status: 401 });

  const { name } = await context.params;

  const demo = DEMO_NAME.exec(name);
  if (demo) return demoPlaceholder(demo[1]);

  // Dono e confirmação conferidos numa consulta só: cada foto de uma lista é
  // uma requisição destas.
  if (!(await canViewPhoto(user, name))) return new Response("Não encontrada", { status: 404 });

  const image = await readImage(name);
  if (!image) return new Response("Não encontrada", { status: 404 });

  return new Response(new Uint8Array(image.data), { headers: { ...HEADERS, "Content-Type": image.mime } });
}

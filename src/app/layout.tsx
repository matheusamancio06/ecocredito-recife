import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { Header } from "@/components/Header";
import { OfflineSync } from "@/components/OfflineSync";
import { PwaRegister } from "@/components/PwaRegister";

export const metadata: Metadata = {
  title: { default: "EcoCrédito Recife", template: "%s · EcoCrédito Recife" },
  description:
    "Registre entulho jogado na rua e acumule EcoCoins ao reciclar. Protótipo acadêmico para a gestão de resíduos do Recife.",
  applicationName: "EcoCrédito Recife",
  appleWebApp: { capable: true, title: "EcoCrédito", statusBarStyle: "default" },
  icons: { icon: "/pwa-icon/192", apple: "/pwa-icon/192" },
};

export const viewport: Viewport = {
  themeColor: "#94c044",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR">
      <body className="flex min-h-dvh flex-col">
        <Header />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
        <OfflineSync />
        <footer className="border-t border-line px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 text-center text-xs text-ink-muted">
          <p>
            <Link href="/privacidade" className="font-semibold underline">
              Aviso de privacidade
            </Link>
          </p>
          <p className="mt-1">
            Projeto acadêmico, sem vínculo oficial com a Prefeitura do Recife. Bairros e pontos de descarte:
            Portal de Dados Abertos da Prefeitura do Recife (ODbL). Mapa © colaboradores do OpenStreetMap.
          </p>
        </footer>
        <PwaRegister />
      </body>
    </html>
  );
}

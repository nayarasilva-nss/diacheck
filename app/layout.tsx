import type { Metadata, Viewport } from "next";
import { Schibsted_Grotesk } from "next/font/google";
import "./globals.css";
import { RegistrarSW } from "./RegistrarSW";

const schibsted = Schibsted_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-schibsted",
});

export const metadata: Metadata = {
  title: "DiaCheck",
  description: "Tudo em ordem, do começo ao fim do dia.",
  appleWebApp: { capable: true, title: "DiaCheck", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0d1b2a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={schibsted.variable} suppressHydrationWarning>
      <head>
        {/* Tema escolhido (claro/escuro) aplicado antes de pintar, sem piscar. Sem escolha, segue o do aparelho. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("kenkyo-theme");if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t)}catch(e){}`,
          }}
        />
      </head>
      <body>
        {children}
        <RegistrarSW />
      </body>
    </html>
  );
}

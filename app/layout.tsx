import type { Metadata } from "next";
import { Schibsted_Grotesk } from "next/font/google";
import "./globals.css";

const schibsted = Schibsted_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-schibsted",
});

export const metadata: Metadata = {
  title: "DiaCheck",
  description: "Tudo em ordem, do começo ao fim do dia.",
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
      <body>{children}</body>
    </html>
  );
}

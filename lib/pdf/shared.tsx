import "server-only";
import path from "node:path";
import { Font, Image, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";

// Registro de fonte + paleta compartilhados pelos relatórios em PDF
// (auditoria, histórico de checklist, requisição) — mesmo motor pros
// três, é o que garante que a impressão saia igual não importa se quem
// pediu está no celular ou no computador (ver lib/pdf/audit-report.tsx
// pro histórico completo dessa decisão).
const FONT_DIR = path.join(process.cwd(), "lib/pdf/fonts"); // incluída no deploy via next.config.ts
const FAMILY = "Liberation Sans";
Font.register({
  family: FAMILY,
  fonts: [
    { src: path.join(FONT_DIR, "LiberationSans-Regular.ttf") },
    { src: path.join(FONT_DIR, "LiberationSans-Bold.ttf"), fontWeight: 700 },
  ],
});
Font.registerHyphenationCallback((word) => [word]);

export const FONT_FAMILY = FAMILY;
export const INK = "#16140f";
export const MUTED = "#65635a";
export const FAINT = "#a19f92";
export const LINE = "#e3e1da";
export const NAVY = "#0d1b2a";
export const BADGE_BG = "#e1f2f4";
export const BADGE_TEXT = "#0f6672";
const BORDER = 0.75; // 1px

/** Texto de `px` pixels da página web — mesma conversão usada no
 * relatório de auditoria (fontSize em pt = px × 0,75, entrelinha 1.6). */
export const t = (px: number, extra: Style = {}): Style => ({ fontSize: px * 0.75, lineHeight: 1.6, ...extra });
export const bold = { fontWeight: 700 } as const;
export const caps = (px: number, em: number): Style => ({ ...bold, textTransform: "uppercase", letterSpacing: px * 0.75 * em });

export const shared = StyleSheet.create({
  page: { paddingTop: 45.35, paddingBottom: 45.35, paddingHorizontal: 39.75, fontFamily: FAMILY, color: INK },
  head: { marginTop: 3, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 2.25, borderColor: "#1b9aaa", paddingBottom: 13.5, marginBottom: 18 },
  logo: { width: 39, height: 39, objectFit: "contain" },
  h1: t(20, { ...bold, marginBottom: 3 }),
  sub: t(13, { color: MUTED }),
  badge: t(11, { ...caps(11, 0.04), alignSelf: "flex-start", marginTop: 4.5, paddingVertical: 2.25, paddingHorizontal: 7.5, borderRadius: 4.5, backgroundColor: BADGE_BG, color: BADGE_TEXT }),
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 21, marginBottom: 16.5 },
  gridCell: { width: "45%" },
  gridText: t(13.5),
  label: t(10.5, { ...caps(10.5, 0.05), color: FAINT, marginBottom: 1.5 }),
  obs: { ...t(13.5), marginBottom: 16.5, padding: 9, backgroundColor: "#f7f6f2", borderRadius: 6 },
  table: { borderTopWidth: BORDER, borderLeftWidth: BORDER, borderColor: LINE, marginBottom: 21 },
  tr: { flexDirection: "row" },
  th: { flexDirection: "row", backgroundColor: NAVY },
  cell: { paddingVertical: 6, paddingHorizontal: 7.5, borderRightWidth: BORDER, borderBottomWidth: BORDER, borderColor: LINE },
  td: t(12.5),
  tdNum: t(12.5, { textAlign: "right" }),
  thText: t(11, { ...caps(11, 0.03), color: "#ffffff" }),
  signRow: { flexDirection: "row", justifyContent: "center", gap: 30, marginTop: 37.5 },
  signLine: { width: 172.5, borderTopWidth: BORDER, borderColor: INK, paddingTop: 3.75 },
  signText: t(12, { color: MUTED }),
  endNote: t(11, { color: FAINT, textAlign: "center", marginTop: 25.5 }),
  pageNo: { position: "absolute", bottom: 20, right: 39.69, fontSize: 7.5, color: FAINT },
  footer: { position: "absolute", bottom: 18, left: 39.75, right: 39.75, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: BORDER, borderColor: LINE, paddingTop: 6 },
  footerLogo: { height: 11, objectFit: "contain" },
  footerText: { fontSize: 7.5, color: FAINT },
});

/** Logo da empresa; sem logo própria, o ícone do DiaCheck (a Kenkyo mantém a dela). */
export async function loadOrgLogo(org: { logoUrl: string | null; slug?: string | null }, origin: string) {
  const padrao = org.slug === "kenkyo" ? "/kenkyo-logo.png" : "/diacheck-icon.png";
  return (await loadImage(org.logoUrl ?? padrao, origin)) ?? (await loadImage(padrao, origin));
}

/** Logo horizontal do DiaCheck para o rodapé. */
export const loadDiaCheckLogo = (origin: string) => loadImage("/diacheck-logo.png", origin);

/** Rodapé de todas as páginas: identidade do DiaCheck, data de geração e página. */
export function PdfFooter({ logo, orgName, geradoEm }: { logo: Buffer | null; orgName: string; geradoEm: string }) {
  return (
    <View style={shared.footer} fixed>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- Image do react-pdf não tem alt */}
        {logo && <Image src={logo} style={shared.footerLogo} />}
        <Text style={shared.footerText}>diacheck.app.br · gerado para {orgName} em {geradoEm}</Text>
      </View>
      <Text style={shared.footerText} render={({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}`} />
    </View>
  );
}

/** Linha de tabela com bordas colapsadas (1px), como `border-collapse`. */
export function Row({ cells, widths, header }: { cells: React.ReactNode[]; widths: (number | undefined)[]; header?: boolean }) {
  return (
    <View style={header ? shared.th : shared.tr} wrap={false}>
      {cells.map((c, i) => (
        <View key={i} style={[shared.cell, widths[i] ? { width: widths[i] } : { flex: 1 }]}>
          {typeof c === "string" ? <Text style={header ? shared.thText : shared.td}>{c}</Text> : c}
        </View>
      ))}
    </View>
  );
}

/** Baixa uma imagem e devolve só se for JPEG ou PNG — os formatos que o
 * PDF aceita. Usado pro logo da empresa. */
export async function loadImage(src: string, origin: string): Promise<Buffer | null> {
  try {
    const res = await fetch(new URL(src, origin), { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const jpeg = buf[0] === 0xff && buf[1] === 0xd8;
    const png = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    return jpeg || png ? buf : null;
  } catch {
    return null;
  }
}

export function generatedAtNow() {
  return new Date().toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

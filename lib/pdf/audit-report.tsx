import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import * as fontkit from "fontkit";
import type { Style } from "@react-pdf/types";
import { AUDIT_STATUS_LABEL, WEIGHT_LABEL, classifyAudit, computeAuditScore } from "@/lib/audit-scoring";
import type { getAudit } from "@/lib/data/audits";

// Relatório de auditoria gerado no servidor. Antes era a página
// /imprimir + "Salvar como PDF" do navegador, e cada navegador (Chrome
// desktop, Safari/Chrome no celular) paginava diferente — a mesma
// auditoria saía com 5 páginas no computador e 7 no celular.
//
// O resultado reproduz o que o Chrome desktop imprimia (o "padrão web"),
// página por página:
// - cada medida do CSS antigo em px vira pt × 0,75, com a entrelinha 1.6
//   que o texto herdava do app;
// - fonte com as medidas da Arial (abaixo) e espaços que não encolhem
//   (patches/@react-pdf+textkit*.patch), para as linhas quebrarem igual;
// - larguras de coluna calculadas como o Chrome (issueColumns);
// - cabeçalho da tabela repetido no topo de cada página (headerBefore).
// Validado contra o Chrome em 9 auditorias de teste (1 a 10 páginas, com
// e sem fotos): mesmas quebras de linha e mesmo número de páginas. Mexeu
// em alguma medida? Compare com a versão impressa pelo navegador.
//
// Fonte Liberation Sans (lib/pdf/fonts, licença OFL): mesmas medidas
// da Arial que o navegador usava, letra por letra — com Helvetica as
// linhas quebravam em pontos diferentes. Não tem ⚠ nem emoji.
const FONT_DIR = path.join(process.cwd(), "lib/pdf/fonts"); // incluída no deploy via next.config.ts
const FONT_FILES = { regular: "LiberationSans-Regular.ttf", bold: "LiberationSans-Bold.ttf" } as const;
const FAMILY = "Liberation Sans";
Font.register({
  family: FAMILY,
  fonts: [
    { src: path.join(FONT_DIR, FONT_FILES.regular) },
    { src: path.join(FONT_DIR, FONT_FILES.bold), fontWeight: 700 },
  ],
});

// O hifenizador padrão é o do inglês ("NÃO CON-FORME"); sem ele, a
// palavra inteira vai para a linha de baixo, como no navegador.
Font.registerHyphenationCallback((word) => [word]);

type Audit = NonNullable<Awaited<ReturnType<typeof getAudit>>>;

const INK = "#16140f";
const MUTED = "#65635a";
const FAINT = "#a19f92";
const LINE = "#e3e1da";
const DARK = "#3d3b35";
const GREEN = "#16a34a";
const YELLOW = "#f5b800";
const RED = "#e63946";
const BORDER = 0.75; // 1px

/** Texto de `px` pixels da página web. O fontSize precisa ir junto do
 * lineHeight: sem unidade, o react-pdf multiplica pela fonte do próprio
 * elemento e, se ela não estiver declarada ali, usa 18pt. */
const t = (px: number, extra: Style = {}): Style => ({ fontSize: px * 0.75, lineHeight: 1.6, ...extra });
const bold = { fontWeight: 700 } as const;
const caps = (px: number, em: number): Style => ({ ...bold, textTransform: "uppercase", letterSpacing: px * 0.75 * em });

const s = StyleSheet.create({
  // @page { margin: 16mm 14mm }
  page: { paddingTop: 45.35, paddingBottom: 45.35, paddingHorizontal: 39.75, fontFamily: FAMILY, color: INK },
  head: { marginTop: 3, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 2.25, paddingBottom: 13.5, marginBottom: 18 },
  logo: { width: 39, height: 39, objectFit: "contain" },
  h1: t(20, { ...bold, marginBottom: 3 }),
  sub: t(13, { color: MUTED }),
  badge: t(11, { ...caps(11, 0.04), alignSelf: "flex-start", marginTop: 4.5, paddingVertical: 2.25, paddingHorizontal: 7.5, borderRadius: 4.5 }),
  grid: { flexDirection: "row", gap: 21, marginBottom: 16.5 },
  gridCell: { flex: 1 },
  gridText: t(13.5),
  label: t(10.5, { ...caps(10.5, 0.05), color: FAINT, marginBottom: 1.5 }),
  score: { flexDirection: "row", gap: 15, marginBottom: 16.5 },
  scoreMain: { width: 142.5, borderWidth: BORDER, borderColor: LINE, borderRadius: 7.5, padding: 12, alignItems: "center" },
  scoreN: { ...bold, fontSize: 34.5, lineHeight: 1, marginTop: 4.5 },
  scoreLabel: t(16, { ...bold, marginTop: 4.5 }),
  scoreSide: { flex: 1, borderWidth: BORDER, borderColor: LINE, borderRadius: 7.5, padding: 12 },
  sideText: t(13),
  stack: { flexDirection: "row", height: 10.5, borderRadius: 5.25, overflow: "hidden", backgroundColor: LINE, marginTop: 6, marginBottom: 9 },
  legend: { flexDirection: "row", flexWrap: "wrap", columnGap: 12 },
  legendText: t(12, { color: DARK }),
  dot: { width: 6.75, height: 6.75, borderRadius: 3.4, marginRight: 3.75 },
  sec: t(13, { ...caps(13, 0.05), marginTop: 19.5, marginBottom: 7.5, paddingLeft: 7.5, borderLeftWidth: 3 }),
  table: { borderTopWidth: BORDER, borderLeftWidth: BORDER, borderColor: LINE, marginBottom: 6 },
  tr: { flexDirection: "row" },
  th: { flexDirection: "row", backgroundColor: "#0d1b2a" },
  cell: { paddingVertical: 6, paddingHorizontal: 7.5, borderRightWidth: BORDER, borderBottomWidth: BORDER, borderColor: LINE },
  td: t(12.5),
  thText: t(11, { ...caps(11, 0.03), color: "#ffffff" }),
  bar: { height: 6.75, borderRadius: 3.75, backgroundColor: LINE, overflow: "hidden", marginTop: 5 },
  tag: t(10.5, caps(10.5, 0.03)),
  resp: t(11, { color: MUTED }),
  photos: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  photo: { width: "31%", height: 90, objectFit: "cover", borderRadius: 4.5 },
  textBox: { borderWidth: BORDER, borderColor: LINE, borderRadius: 6, paddingVertical: 9, paddingHorizontal: 10.5 },
  textBody: { fontSize: 9.75, lineHeight: 1.55 },
  // .sign { flex-wrap: wrap; gap: 40px } com caixas de 230px: cabem 2
  // por fileira, e cada fileira pode cair numa página diferente.
  signRow: { flexDirection: "row", justifyContent: "center", gap: 30, marginTop: 30 },
  signLine: { width: 172.5, borderTopWidth: BORDER, borderColor: INK, paddingTop: 3.75, alignItems: "center" },
  signText: t(12, { color: DARK, textAlign: "center" }),
  endNote: t(11, { color: FAINT, textAlign: "center", marginTop: 25.5 }),
  pageNo: { position: "absolute", bottom: 20, right: 39.69, fontSize: 7.5, color: FAINT },
  footer: { position: "absolute", bottom: 18, left: 39.75, right: 39.75, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: BORDER, borderColor: LINE, paddingTop: 6 },
  footerLogo: { height: 11, objectFit: "contain" },
  footerText: { fontSize: 7.5, color: FAINT },
});

/** Baixa uma imagem e devolve só se for JPEG ou PNG (os formatos que o
 * PDF aceita); qualquer outra coisa (HEIC, WebP, SVG) ou erro de rede
 * persistente é ignorada em vez de derrubar o relatório inteiro. Tenta de
 * novo uma vez: uma foto que some muda a altura da linha e a paginação. */
async function loadImage(src: string, origin: string, attempts = 2): Promise<Buffer | null> {
  try {
    const res = await fetch(new URL(src, origin), { signal: AbortSignal.timeout(10_000) });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const jpeg = buf[0] === 0xff && buf[1] === 0xd8;
    const png = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    return jpeg || png ? buf : null;
  } catch {
    return attempts > 1 ? loadImage(src, origin, attempts - 1) : null;
  }
}

/** `fn` em cada item, no máximo `limit` ao mesmo tempo, mantendo a ordem. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** Linha de tabela com bordas colapsadas (1px), como `border-collapse`. */
function Row({ cells, widths, header }: { cells: React.ReactNode[]; widths: (number | undefined)[]; header?: boolean }) {
  return (
    <View style={header ? s.th : s.tr} wrap={false}>
      {cells.map((c, i) => (
        <View key={i} style={[s.cell, widths[i] ? { width: widths[i] } : { flex: 1 }]}>
          {typeof c === "string" ? <Text style={header ? s.thText : s.td}>{c}</Text> : c}
        </View>
      ))}
    </View>
  );
}

function chunk<T>(list: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

// Larguras medidas na página web impressa (A4, 14mm de margem lateral).
const GROUP_COLS = [undefined, 52.5, 120];

const measureFonts: Partial<Record<keyof typeof FONT_FILES, fontkit.Font>> = {};
/** Largura do texto (na unidade de `size`), com a mesma fonte do PDF. */
function textWidth(weight: keyof typeof FONT_FILES, size: number, text: string, letterSpacing = 0) {
  const font = (measureFonts[weight] ??= fontkit.create(readFileSync(path.join(FONT_DIR, FONT_FILES[weight]))));
  return (font.layout(text).advanceWidth * size) / font.unitsPerEm + letterSpacing * text.length;
}

/** Largura × altura de um JPEG/PNG, lidas do cabeçalho do arquivo. */
function imageSize(buf: Buffer): [number, number] | null {
  if (buf[0] === 0x89) return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
  for (let i = 2; i + 9 < buf.length; ) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    // SOF0..SOF15, exceto DHT (C4), JPG (C8) e DAC (CC)
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
    }
    i += 2 + len;
  }
  return null;
}

/** Larguras (pt) das colunas de apontamentos exatamente como o Chrome
 * calcula uma tabela automática (Blink, DistributeInlineSizeToComputed-
 * InlineSizeAuto / "max guess" da especificação css-tables-3):
 *
 * - cada coluna tem uma largura mínima (maior palavra) e máxima (tudo
 *   numa linha), contando o título da coluna, padding (20px) e borda (1px);
 * - Peso (width: 70px) e Situação (width: 100px) ficam fixas, ou na
 *   mínima se a maior palavra não couber (ex.: "PARCIALMENTE");
 * - Critério e Observação partem da mínima e dividem o que sobra na
 *   proporção de (máxima − mínima) de cada uma;
 * - foto (height: 120px, width: 31%) conta na máxima como a largura que
 *   teria com 118px de altura (box-sizing) + 2px de borda, e 8px de gap.
 *
 * A largura decide onde cada linha quebra e, portanto, a paginação. */
function issueColumns(
  issues: { groupName: string; itemLabel: string; responsible: string; note: string; status: string | null }[],
  photoSizes: ([number, number] | null)[][],
) {
  // Medidas em px do CSS (1px = 0,75pt); fonte em px → pt na medição.
  const w = (weight: keyof typeof FONT_FILES, px: number, text: string, lsEm = 0) => textWidth(weight, px, text, px * lsEm);
  const words = (text: string) => text.split(/\s+/).filter(Boolean);
  const caps = (px: number, text: string) => w("bold", px, text.toUpperCase(), 0.03);
  const maxOf = (list: number[]) => list.reduce((m, x) => Math.max(m, x), 0);
  const EXTRA = 20 + 1; // padding 10+10, borda 0,5+0,5 (colapsada)

  const th = (label: string) => caps(11, label);
  let minC = th("Critério"), maxC = minC;
  let minO = th("Observação"), maxO = minO;
  let sitMin = th("Situação");
  issues.forEach((a, i) => {
    const resp = a.responsible ? `Resp.: ${a.responsible}` : "";
    const note = a.note || "—";
    const status = a.status === "nao_conforme" ? "Não conforme" : "Parcialmente conforme";
    minC = maxOf([minC, ...words(a.groupName).map((x) => caps(10.5, x)), ...words(a.itemLabel).map((x) => w("regular", 12.5, x)), ...words(resp).map((x) => w("regular", 11, x))]);
    maxC = maxOf([maxC, caps(10.5, a.groupName), w("regular", 12.5, a.itemLabel), resp ? w("regular", 11, resp) : 0]);
    minO = maxOf([minO, ...words(note).map((x) => w("regular", 12.5, x))]);
    const sizes = photoSizes[i].filter((x): x is [number, number] => !!x);
    const photosRow = sizes.reduce((sum, [iw, ih]) => sum + (118 * iw) / ih + 2, 0) + Math.max(0, sizes.length - 1) * 8;
    maxO = maxOf([maxO, w("regular", 12.5, note), photosRow]);
    sitMin = maxOf([sitMin, ...words(status).map((x) => caps(10.5, x))]);
  });
  [minC, maxC, minO, maxO, sitMin] = [minC, maxC, minO, maxO, sitMin].map((x) => x + EXTRA);

  const total = 686; // largura que o Chrome distribui entre as colunas na impressão
  const peso = 70;
  const sit = Math.max(100, sitMin);
  const specified = minC + minO + peso + sit;
  const grow = maxC - minC + (maxO - minO);
  const dist = total - specified;
  const crit = dist <= 0 ? minC : grow > 0 ? minC + (dist * (maxC - minC)) / grow : minC + dist / 2;
  const obs = total - peso - sit - crit;
  // px → pt. Cada célula aqui inclui padding e borda direita, então a
  // área de texto é a coluna − 21px, como no Chrome.
  return [crit * 0.75, peso * 0.75, sit * 0.75, obs * 0.75];
}

async function loadOrgLogo(org: { logoUrl: string | null; slug?: string | null }, origin: string) {
  const padrao = org.slug === "kenkyo" ? "/kenkyo-logo.png" : "/diacheck-icon.png";
  return (await loadImage(org.logoUrl ?? padrao, origin)) ?? (await loadImage(padrao, origin));
}

export async function renderAuditPdf(
  audit: Audit,
  org: { name: string; logoUrl: string | null; slug?: string | null; brandColor: string },
  /** Origem do site (ex.: https://app.exemplo.com), para achar o logo padrão em /public. */
  origin: string,
) {
  const { percent, groupScores, counts } = computeAuditScore(audit.answers);
  const cls = classifyAudit(percent);
  const scoreColor = cls.color === YELLOW ? "#b58900" : cls.color;
  const applicable = counts.conforme + counts.parcial + counts.nao_conforme;
  const naCount = audit.answers.filter((a) => a.status === "nao_aplica").length;
  const seg = (n: number) => `${applicable ? (n / applicable) * 100 : 0}%`;
  const date = new Date(`${audit.visitDate}T00:00:00`).toLocaleDateString("pt-BR");
  const issues = audit.answers
    .filter((a) => a.status === "nao_conforme" || a.status === "parcial")
    .sort((a, b) => b.weight - a.weight || (a.status === "nao_conforme" ? -1 : 1));
  const criticalOpen = issues.filter((a) => a.weight === 3 && a.status === "nao_conforme").length;
  const brand = org.brandColor;
  const generatedAt = new Date().toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  // Imagens antes de montar o documento (até 6 downloads simultâneos).
  const photoUrls = [...new Set(issues.flatMap((a) => a.photoUrls))];
  const [logo, dcLogo, photoBufs] = await Promise.all([
    loadOrgLogo(org, origin),
    loadImage("/diacheck-logo.png", origin),
    mapLimit(photoUrls, 6, (u) => loadImage(u, origin)),
  ]);
  const photos = new Map(photoUrls.map((u, i) => [u, photoBufs[i]]));
  const ISSUE_COLS = issueColumns(
    issues,
    issues.map((a) => a.photoUrls.map((u) => photos.get(u)).map((b) => (b ? imageSize(b) : null))),
  );

  const signatures: [string, string][] = [
    [audit.auditorName, "Auditor"],
    ...(audit.coAuditorName ? [[audit.coAuditorName, "Auditor"] as [string, string]] : []),
    ["Responsável da unidade", "Nome e assinatura"],
  ];

  // Como no navegador, o título de uma seção pode ficar sozinho no pé da
  // página (sem minPresenceAhead) — mudar isso muda a paginação.
  const sec = (title: string) => <Text style={[s.sec, { borderColor: brand }]}>{title}</Text>;

  // O navegador repete o cabeçalho da tabela (<thead>) no topo de cada
  // página e nunca o deixa sozinho no pé de uma página. O `fixed` do
  // react-pdf não reserva espaço, então fazemos como o navegador: monta,
  // vê em que página caiu cada apontamento e põe o cabeçalho colado ao
  // primeiro apontamento de cada página; repete até as páginas pararem
  // de mudar (em geral 2 ou 3 passadas).
  let headerBefore = new Set<number>([0]);
  let buf: Buffer | null = null;
  for (let pass = 0; pass < 6; pass++) {
    const rowPage: number[] = [];
    buf = await renderToBuffer(build(headerBefore, rowPage));
    const next = new Set(rowPage.map((p, i) => (i === 0 || p !== rowPage[i - 1] ? i : -1)).filter((i) => i >= 0));
    if (next.size === headerBefore.size && [...next].every((i) => headerBefore.has(i))) break;
    headerBefore = next;
  }
  return buf!;

  function build(headerBefore: Set<number>, rowPage: number[]) {
    return (
      <Document title={`Auditoria ${audit.unitName} ${date}`} author={org.name}>
        <Page size="A4" style={s.page}>
          <View style={[s.head, { borderColor: brand }]}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- Image do react-pdf não tem alt */}
            {logo && <Image src={logo} style={s.logo} />}
            <View>
              <Text style={s.h1}>Auditoria de Unidade</Text>
              <Text style={s.sub}>{org.name} · {audit.unitName}</Text>
              <Text style={[s.badge, { backgroundColor: cls.color, color: cls.label === "Bom" ? INK : "#ffffff" }]}>
                {audit.scorePercent ?? percent}% · {cls.label}
              </Text>
            </View>
          </View>

          <View style={s.grid}>
            <View style={s.gridCell}><Text style={s.label}>Unidade</Text><Text style={s.gridText}>{audit.unitName}</Text></View>
            <View style={s.gridCell}><Text style={s.label}>Data da visita</Text><Text style={s.gridText}>{date}</Text></View>
            <View style={s.gridCell}>
              <Text style={s.label}>{audit.coAuditorName ? "Auditores" : "Auditor"}</Text>
              <Text style={s.gridText}>{audit.auditorName}</Text>
              {audit.coAuditorName && <Text style={s.gridText}>{audit.coAuditorName}</Text>}
            </View>
          </View>

          <View style={s.score} wrap={false}>
            <View style={s.scoreMain}>
              <Text style={s.label}>Nota geral</Text>
              <Text style={[s.scoreN, { color: scoreColor }]}>{percent}%</Text>
              <Text style={s.scoreLabel}>{cls.label}</Text>
            </View>
            <View style={s.scoreSide}>
              <Text style={s.sideText}>
                <Text style={bold}>{applicable} critérios avaliados</Text>
                {naCount > 0 ? ` · ${naCount} não se aplicam` : ""}
              </Text>
              <View style={s.stack}>
                <View style={{ width: seg(counts.conforme), backgroundColor: GREEN }} />
                <View style={{ width: seg(counts.parcial), backgroundColor: YELLOW }} />
                <View style={{ width: seg(counts.nao_conforme), backgroundColor: RED }} />
              </View>
              <View style={s.legend}>
                {([["Conformes", counts.conforme, GREEN], ["Parciais", counts.parcial, YELLOW], ["Não conformes", counts.nao_conforme, RED]] as const).map(
                  ([l, n, c]) => (
                    <View key={l} style={{ flexDirection: "row", alignItems: "center" }}>
                      <View style={[s.dot, { backgroundColor: c }]} />
                      <Text style={s.legendText}>{l} {n}</Text>
                    </View>
                  ),
                )}
              </View>
              {criticalOpen > 0 && (
                <Text style={t(13, { ...bold, marginTop: 9, color: "#b3261e" })}>
                  Atenção: {criticalOpen} {criticalOpen === 1 ? "critério crítico não conforme" : "critérios críticos não conformes"}
                </Text>
              )}
            </View>
          </View>

          {sec("Nota por grupo")}
          <View style={s.table}>
            <Row header cells={["Grupo", "Nota", "Desempenho"]} widths={GROUP_COLS} />
            {groupScores.map((g) => (
              <Row
                key={g.name}
                widths={GROUP_COLS}
                cells={[
                  g.name,
                  <Text key="n" style={[s.td, bold]}>{g.percent}%</Text>,
                  <View key="b" style={s.bar}>
                    <View style={{ width: `${g.percent}%`, height: "100%", backgroundColor: classifyAudit(g.percent).color }} />
                  </View>,
                ]}
              />
            ))}
          </View>
          <View style={[s.legend, { marginBottom: 4.5 }]}>
            {["Excelente ≥ 90%", "Bom 75–89%", "Regular 60–74%", "Inadequado < 60%"].map((l) => (
              <Text key={l} style={s.legendText}>{l}</Text>
            ))}
          </View>

          {sec(`Apontamentos (${issues.length})`)}
          {issues.length === 0 ? (
            <Text style={t(13)}>Nenhuma inconformidade registrada nesta visita.</Text>
          ) : (
            <View style={s.table}>
              {issues.map((a, i) => {
                const imgs = a.photoUrls.map((u) => photos.get(u)).filter((b): b is Buffer => !!b);
                const row = (
                  <Row
                    key={a.id}
                    widths={ISSUE_COLS}
                    cells={[
                      <View key="c">
                        {/* Anota em que página este apontamento caiu (ver headerBefore). */}
                        <Text
                          style={{ position: "absolute", fontSize: 1 }}
                          render={({ pageNumber }) => {
                            rowPage[i] = pageNumber;
                            return "";
                          }}
                        />
                        <Text style={[s.tag, { color: FAINT }]}>{a.groupName}</Text>
                        <Text style={s.td}>{a.itemLabel}</Text>
                        {a.responsible ? <Text style={s.resp}>Resp.: {a.responsible}</Text> : null}
                      </View>,
                      WEIGHT_LABEL[a.weight] ?? "",
                      <Text key="s" style={[s.tag, { color: a.status === "nao_conforme" ? "#b3261e" : "#8a6d00" }]}>
                        {AUDIT_STATUS_LABEL[a.status!]}
                      </Text>,
                      <View key="o">
                        <Text style={s.td}>{a.note || "—"}</Text>
                        {imgs.length > 0 && (
                          <View style={s.photos}>
                            {imgs.map((b, i) => (
                              // eslint-disable-next-line jsx-a11y/alt-text -- Image do react-pdf não tem alt
                              <Image key={i} src={b} style={s.photo} />
                            ))}
                          </View>
                        )}
                      </View>,
                    ]}
                  />
                );
                return headerBefore.has(i) ? (
                  <View key={a.id} wrap={false}>
                    <Row header cells={["Critério", "Peso", "Situação", "Observação"]} widths={ISSUE_COLS} />
                    {row}
                  </View>
                ) : (
                  row
                );
              })}
            </View>
          )}

          {audit.comments ? (
            <View>
              {sec(audit.coAuditorName ? "Comentários dos auditores" : "Comentários do auditor")}
              <View style={s.textBox}><Text style={s.textBody}>{audit.comments}</Text></View>
            </View>
          ) : null}
          {audit.actionPlan ? (
            <View>
              {sec("Plano de ação")}
              <View style={s.textBox}><Text style={s.textBody}>{audit.actionPlan}</Text></View>
            </View>
          ) : null}

          {chunk(signatures, 2).map((row, i) => (
            <View key={i} style={[s.signRow, i === 0 ? { marginTop: 42 } : {}]} wrap={false}>
              {row.map(([name, role]) => (
                <View key={name} style={s.signLine}>
                  <Text style={s.signText}>{name}</Text>
                  <Text style={s.signText}>{role}</Text>
                </View>
              ))}
            </View>
          ))}
          <View style={s.footer} fixed>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              {/* eslint-disable-next-line jsx-a11y/alt-text -- Image do react-pdf não tem alt */}
              {dcLogo && <Image src={dcLogo} style={s.footerLogo} />}
              <Text style={s.footerText}>diacheck.app.br · gerado para {org.name} em {generatedAt}</Text>
            </View>
            <Text style={s.footerText} render={({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}`} />
          </View>
        </Page>
      </Document>
    );
  }
}

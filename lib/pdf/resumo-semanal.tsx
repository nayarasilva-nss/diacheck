/* eslint-disable jsx-a11y/alt-text -- react-pdf Image não é HTML; não tem alt */
import "server-only";
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { FAINT, FONT_FAMILY, INK, LINE, MUTED, NAVY, PdfFooter, t, bold, caps } from "./shared";

/**
 * O resumo semanal da operação — o documento que o dono (de qualquer
 * nicho) assina ou arquivá: como foi a semana nos checklists, quem
 * deixou escapar e as anomalias em aberto. Mesmo motor dos outros
 * relatórios (lib/pdf/shared.tsx) e a marca da empresa.
 */

const BORDER = 0.75;
const s = StyleSheet.create({
  page: { paddingTop: 45.35, paddingBottom: 45.35, paddingHorizontal: 39.75, fontFamily: FONT_FAMILY, color: INK },
  head: { marginTop: 3, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 2.25, paddingBottom: 13.5, marginBottom: 18 },
  logo: { width: 39, height: 39, objectFit: "contain" },
  h1: t(20, { ...bold, marginBottom: 3 }),
  sub: t(13, { color: MUTED }),
  sec: t(13, { ...caps(13, 0.05), marginTop: 19.5, marginBottom: 7.5, paddingLeft: 7.5, borderLeftWidth: 3, borderColor: INK }),
  kpiRow: { flexDirection: "row", gap: 12, marginBottom: 18 },
  kpi: { flex: 1, borderWidth: BORDER, borderColor: LINE, borderRadius: 6, padding: 10, alignItems: "center" },
  kpiN: { ...bold, fontSize: 22, lineHeight: 1.2 },
  kpiLabel: t(10.5, { color: MUTED, textAlign: "center" }),
  table: { borderTopWidth: BORDER, borderLeftWidth: BORDER, borderColor: LINE, marginBottom: 18 },
  tr: { flexDirection: "row" },
  th: { flexDirection: "row", backgroundColor: NAVY },
  cell: { paddingVertical: 6, paddingHorizontal: 7.5, borderRightWidth: BORDER, borderBottomWidth: BORDER, borderColor: LINE },
  td: t(12.5),
  thText: t(11, { ...caps(11, 0.03), color: "#ffffff" }),
  ok: t(12.5, { color: "#15803d", ...bold }),
  warn: t(12.5, { color: "#b58900", ...bold }),
  bad: t(12.5, { color: "#e63946", ...bold }),
  vazio: t(12.5, { color: MUTED, marginBottom: 18 }),
  endNote: t(11, { color: FAINT, textAlign: "center", marginTop: 25.5 }),
});

export type DadosSemanais = {
  empresa: string;
  de: string; até: string;
  geradoEm: string;
  esperados: number;
  concluidos: number;
  taxa: number | null;
  pontualidade: number | null;
  unidades: { nome: string; esperados: number; concluidos: number; taxa: number; pontualidade: number | null }[];
  pessoas: { nome: string; unidade: string | null; esperados: number; concluidos: number; taxa: number }[];
  anomaliasAbertas: { data: string; unidade: string; tipos: string; detalhe: string | null }[];
  logo: Buffer | null;
  /** Logo horizontal do DiaCheck, para o rodapé. */
  dcLogo?: Buffer | null;
  brandColor?: string;
};

const corDaTaxa = (v: number) => (v >= 90 ? s.ok : v >= 75 ? s.warn : s.bad);

export async function renderResumoSemanal(d: DadosSemanais): Promise<Buffer> {
  const pendentes = d.esperados - d.concluidos;
  const cor = d.taxa === null ? undefined : corDaTaxa(d.taxa);
  return renderToBuffer(
    <Document>
      <Page size="A4" style={s.page}>
        <View style={[s.head, { borderColor: d.brandColor ?? "#1b9aaa" }]}>
          {d.logo && <Image style={s.logo} src={d.logo} />}
          <View>
            <Text style={s.h1}>Resumo da semana</Text>
            <Text style={s.sub}>{d.empresa} · {d.de} a {d.até}</Text>
          </View>
        </View>

        <View style={s.kpiRow}>
          <View style={s.kpi}><Text style={s.kpiN}>{d.esperados}</Text><Text style={s.kpiLabel}>checklists esperados</Text></View>
          <View style={s.kpi}><Text style={s.kpiN}>{d.concluidos}</Text><Text style={s.kpiLabel}>concluídos no prazo ou depois</Text></View>
          <View style={s.kpi}><Text style={[s.kpiN, cor]}>{d.taxa === null ? "—" : `${d.taxa}%`}</Text><Text style={s.kpiLabel}>taxa de conclusão</Text></View>
          <View style={s.kpi}><Text style={s.kpiN}>{d.pontualidade === null ? "—" : `${d.pontualidade}%`}</Text><Text style={s.kpiLabel}>pontualidade média</Text></View>
        </View>

        <Text style={s.sec}>Por unidade</Text>
        {d.unidades.length === 0 ? (
          <Text style={s.vazio}>Nenhuma unidade com checklist esperado nesta semana.</Text>
        ) : (
          <View style={s.table}>
            <View style={s.th}>
              <Text style={[s.thText, s.cell, { flex: 2 }]}>Unidade</Text>
              <Text style={[s.thText, s.cell, { flex: 1, textAlign: "right" }]}>Esperados</Text>
              <Text style={[s.thText, s.cell, { flex: 1, textAlign: "right" }]}>Concluídos</Text>
              <Text style={[s.thText, s.cell, { flex: 1, textAlign: "right" }]}>Taxa</Text>
            </View>
            {d.unidades.map((u) => (
              <View key={u.nome} style={s.tr}>
                <Text style={[s.td, s.cell, { flex: 2 }]}>{u.nome}</Text>
                <Text style={[s.td, s.cell, { flex: 1, textAlign: "right" }]}>{u.esperados}</Text>
                <Text style={[s.td, s.cell, { flex: 1, textAlign: "right" }]}>{u.concluidos}</Text>
                <Text style={[corDaTaxa(u.taxa), s.cell, { flex: 1, textAlign: "right" }]}>{u.taxa}%</Text>
              </View>
            ))}
          </View>
        )}

        <Text style={s.sec}>Quem ficou para trás</Text>
        {d.pessoas.length === 0 ? (
          <Text style={s.vazio}>Toda a equipe cumpriu o que era esperado. Nada a cobrar.</Text>
        ) : (
          <View style={s.table}>
            <View style={s.th}>
              <Text style={[s.thText, s.cell, { flex: 2 }]}>Pessoa</Text>
              <Text style={[s.thText, s.cell, { flex: 2 }]}>Unidade</Text>
              <Text style={[s.thText, s.cell, { flex: 1, textAlign: "right" }]}>Feitos</Text>
              <Text style={[s.thText, s.cell, { flex: 1, textAlign: "right" }]}>Esperados</Text>
              <Text style={[s.thText, s.cell, { flex: 1, textAlign: "right" }]}>Taxa</Text>
            </View>
            {d.pessoas.map((p) => (
              <View key={`${p.nome}|${p.unidade ?? 0}`} style={s.tr}>
                <Text style={[s.td, s.cell, { flex: 2 }]}>{p.nome}</Text>
                <Text style={[s.td, s.cell, { flex: 2 }]}>{p.unidade ?? "—"}</Text>
                <Text style={[s.td, s.cell, { flex: 1, textAlign: "right" }]}>{p.concluidos}</Text>
                <Text style={[s.td, s.cell, { flex: 1, textAlign: "right" }]}>{p.esperados}</Text>
                <Text style={[corDaTaxa(p.taxa), s.cell, { flex: 1, textAlign: "right" }]}>{p.taxa}%</Text>
              </View>
            ))}
          </View>
        )}

        <Text style={s.sec}>Ocorrências em aberto</Text>
        {d.anomaliasAbertas.length === 0 ? (
          <Text style={s.vazio}>Nenhuma ocorrência aberta no fim da semana.</Text>
        ) : (
          <View style={s.table}>
            <View style={s.th}>
              <Text style={[s.thText, s.cell, { flex: 1 }]}>Dia</Text>
              <Text style={[s.thText, s.cell, { flex: 2 }]}>Unidade</Text>
              <Text style={[s.thText, s.cell, { flex: 2 }]}>O que aconteceu</Text>
            </View>
            {d.anomaliasAbertas.map((a, i) => (
              <View key={i} style={s.tr}>
                <Text style={[s.td, s.cell, { flex: 1 }]}>{a.data}</Text>
                <Text style={[s.td, s.cell, { flex: 2 }]}>{a.unidade}</Text>
                <Text style={[s.td, s.cell, { flex: 2 }]}>{a.tipos}{a.detalhe ? ` — ${a.detalhe}` : ""}</Text>
              </View>
            ))}
          </View>
        )}

        <Text style={s.endNote}>{pendentes} checklist(s) deixados de fazer na semana.</Text>
        <PdfFooter logo={d.dcLogo ?? null} orgName={d.empresa} geradoEm={d.geradoEm} />
      </Page>
    </Document>,
  );
}

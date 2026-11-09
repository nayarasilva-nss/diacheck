import "server-only";
import { Document, Image, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { PdfFooter, Row, generatedAtNow, loadDiaCheckLogo, loadOrgLogo, shared, t } from "./shared";
import type { getRequisicaoWithItens } from "@/lib/data/requisicoes";

type Requisicao = NonNullable<Awaited<ReturnType<typeof getRequisicaoWithItens>>>;

const TIPO_LABEL: Record<string, string> = {
  interna: "Requisição Interna",
  externa: "Requisição Externa",
};

const STATUS_LABEL: Record<string, string> = {
  aberta: "Aberta",
  conferida: "Conferida",
  cancelada: "Cancelada",
};

const COLS = [undefined, 60, 65, 65];
const COLS_REC = [undefined, 50, 50, 55, 55];

function fmt(d: Date | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export async function renderRequisicaoPdf(
  requisicao: Requisicao,
  org: { name: string; logoUrl: string | null; slug?: string | null; brandColor?: string },
  origin: string,
) {
  const comRecebimento = requisicao.tipo === "externa" && requisicao.recebidoEm !== null;
  const conferidoLabel = requisicao.tipo === "interna" ? "saiu" : "entregue";
  const [logo, dcLogo] = await Promise.all([loadOrgLogo(org, origin), loadDiaCheckLogo(origin)]);

  const pdf = await renderToBuffer(
    <Document title={`${TIPO_LABEL[requisicao.tipo] ?? "Requisição"} — ${requisicao.unitName} — ${new Date(requisicao.createdAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`} author={org.name}>
      <Page size="A4" style={shared.page}>
        <View style={[shared.head, org.brandColor ? { borderColor: org.brandColor } : {}]}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- Image do react-pdf não tem alt */}
          {logo && <Image src={logo} style={shared.logo} />}
          <View>
            <Text style={shared.h1}>{TIPO_LABEL[requisicao.tipo] ?? "Requisição"}</Text>
            <Text style={shared.sub}>{org.name} · {requisicao.unitName}</Text>
            <View style={{ flexDirection: "row", gap: 6 }}>
              <Text style={shared.badge}>{STATUS_LABEL[requisicao.status] ?? requisicao.status}</Text>
              {requisicao.urgente && <Text style={shared.badge}>Urgente</Text>}
            </View>
          </View>
        </View>

        <View style={shared.grid}>
          <View style={shared.gridCell}><Text style={shared.label}>Solicitante</Text><Text style={shared.gridText}>{requisicao.requesterName}</Text></View>
          <View style={shared.gridCell}><Text style={shared.label}>Unidade</Text><Text style={shared.gridText}>{requisicao.unitName}</Text></View>
          <View style={shared.gridCell}><Text style={shared.label}>Criada em</Text><Text style={shared.gridText}>{fmt(requisicao.createdAt)}</Text></View>
          <View style={shared.gridCell}>
            <Text style={shared.label}>{requisicao.status === "cancelada" ? "Cancelada em" : "Conferida em"}</Text>
            <Text style={shared.gridText}>{fmt(requisicao.concluidoEm)}</Text>
          </View>
        </View>

        {requisicao.related && (
          <Text style={shared.obs}>
            <Text style={t(13.5, { fontWeight: 700 })}>Excedente da requisição</Text> de {requisicao.related.requesterName} às{" "}
            {fmt(requisicao.related.createdAt)}.
          </Text>
        )}
        {requisicao.observacao && (
          <Text style={shared.obs}>
            <Text style={t(13.5, { fontWeight: 700 })}>Observação: </Text>
            {requisicao.observacao}
          </Text>
        )}

        <View style={shared.table}>
          {comRecebimento ? (
            <Row header cells={["Item", "Unidade", "Qtd. pedida", `Qtd. ${conferidoLabel}`, "Qtd. recebida"]} widths={COLS_REC} />
          ) : (
            <Row header cells={["Item", "Unidade", "Qtd. pedida", `Qtd. ${conferidoLabel}`]} widths={COLS} />
          )}
          {requisicao.itens.map((item) => (
            <Row
              key={item.id}
              widths={comRecebimento ? COLS_REC : COLS}
              cells={[
                item.nome,
                item.unidadeMedida,
                <Text key="p" style={shared.tdNum}>{item.qtdPedida}</Text>,
                <Text key="c" style={shared.tdNum}>{item.qtdConferida ?? "—"}</Text>,
                ...(comRecebimento ? [<Text key="r" style={shared.tdNum}>{item.qtdRecebida ?? "—"}</Text>] : []),
              ]}
            />
          ))}
        </View>

        {comRecebimento && (
          <Text style={shared.obs}>
            <Text style={t(13.5, { fontWeight: 700 })}>Recebido pela unidade em </Text>
            {fmt(requisicao.recebidoEm)}
            {requisicao.recebimentoObs ? ` — ${requisicao.recebimentoObs}` : ""}
          </Text>
        )}

        <View style={shared.signRow} wrap={false}>
          <View style={shared.signLine}><Text style={shared.signText}>Solicitante — {requisicao.requesterName}</Text></View>
          <View style={shared.signLine}><Text style={shared.signText}>Conferido por</Text></View>
        </View>

        <PdfFooter logo={dcLogo} orgName={org.name} geradoEm={generatedAtNow()} />
      </Page>
    </Document>,
  );
  return pdf;
}

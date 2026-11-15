import "server-only";
import { and, asc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { solicitacaoItens, solicitacoes, units, users } from "@/lib/db/schema";
import { chamarErp, erpConfigurado, ligacaoDaEmpresa, type LigacaoErp } from "./integracao";

/**
 * As solicitações de item avulso vão para o ERP (POST /api/solicitacoes-compra, "aprovacao": true) e lá se aprovam
 * item a item, se compram (com a previsão de entrega) ou se ligam à nota da compra. O checklist pede, lê de volta a
 * situação de cada item (GET) e dá o ok da chegada (situacao "chegada"). Nada aqui depende do ERP: o que não foi fica
 * com erpEnviadaEm nulo e vai na próxima (enviarSolicitacoesPendentes).
 */
const idExterno = (id: number) => `checklist-sol-${id}`;

export async function enviarSolicitacaoAoErp(id: number): Promise<boolean> {
  if (!erpConfigurado()) return false;
  const [s] = await db
    .select({ id: solicitacoes.id, date: solicitacoes.date, urgente: solicitacoes.urgente, observacao: solicitacoes.observacao,
      status: solicitacoes.status, organizationId: solicitacoes.organizationId, cnpj: units.erpCnpj, solicitante: users.name })
    .from(solicitacoes)
    .innerJoin(units, eq(units.id, solicitacoes.unitId))
    .innerJoin(users, eq(users.id, solicitacoes.requesterId))
    .where(eq(solicitacoes.id, id))
    .limit(1);
  if (!s?.cnpj) return false;
  // Liga no ERP da própria empresa; sem ligação configurada, não há para onde enviar.
  const ligacao = await ligacaoDaEmpresa(s.organizationId);
  if (!ligacao) return false;
  const itens = await db.select().from(solicitacaoItens).where(eq(solicitacaoItens.solicitacaoId, id)).orderBy(asc(solicitacaoItens.id));
  const corpo = s.status === "cancelada"
    ? { id_externo: idExterno(s.id), situacao: "cancelada" }
    : {
        id_externo: idExterno(s.id), situacao: "aberta", aprovacao: true, unidade_cnpj: s.cnpj, data: s.date,
        urgente: s.urgente, observacao: s.observacao, solicitante: s.solicitante,
        // a antiga, decidida aqui antes de a aprovação ir para o ERP, chega como estava
        itens: itens.map((i) => ({
          id_externo: String(i.id), descricao: i.nome, quantidade: i.quantidade, unidade: "un",
          aprovacao: i.status, motivo: i.motivoReprovacao, comprado: i.comprado, previsao_entrega: i.dataPrevistaEntrega, chegou: i.chegou,
        })),
      };
  try {
    const resposta = await chamarErp("/api/solicitacoes-compra", { method: "POST", body: JSON.stringify(corpo) }, ligacao);
    if (!resposta.ok) return false;
    await db.update(solicitacoes).set({ erpEnviadaEm: new Date() }).where(eq(solicitacoes.id, s.id));
    return true;
  } catch {
    return false;
  }
}

/** Excluída aqui: cancela no ERP (o que já virou pedido fica lá com o comprador). */
export async function cancelarSolicitacaoNoErp(id: number, ligacao?: LigacaoErp | null): Promise<void> {
  if (!erpConfigurado() && !ligacao) return;
  try {
    await chamarErp("/api/solicitacoes-compra", { method: "POST", body: JSON.stringify({ id_externo: idExterno(id), situacao: "cancelada" }) }, ligacao);
  } catch {
    // fora do ar: o comprador cancela lá
  }
}

/** O ok (ou o desfazer) da chegada de um item. */
export async function enviarChegadaAoErp(solicitacaoId: number, itemId: number, chegou: boolean): Promise<boolean> {
  if (!erpConfigurado()) return false;
  const [s] = await db.select({ organizationId: solicitacoes.organizationId }).from(solicitacoes).where(eq(solicitacoes.id, solicitacaoId)).limit(1);
  const ligacao = await ligacaoDaEmpresa(s?.organizationId);
  if (!ligacao) return false;
  try {
    const resposta = await chamarErp("/api/solicitacoes-compra", {
      method: "POST",
      body: JSON.stringify({ id_externo: idExterno(solicitacaoId), situacao: "chegada", item_id_externo: String(itemId), chegou }),
    }, ligacao);
    return resposta.ok;
  } catch {
    return false;
  }
}

/** O que ainda não chegou ao ERP: só as que ainda andam (abertas, com item que não chegou nem foi reprovado). */
export async function enviarSolicitacoesPendentes(organizationId: number, limite = 50): Promise<number> {
  if (!erpConfigurado()) return 0;
  const pendentes = await db
    .select({ id: solicitacoes.id })
    .from(solicitacoes)
    .innerJoin(units, eq(units.id, solicitacoes.unitId))
    .where(and(eq(solicitacoes.organizationId, organizationId), eq(solicitacoes.status, "aberta"),
      isNull(solicitacoes.erpEnviadaEm), isNotNull(units.erpCnpj)))
    .limit(limite);
  if (pendentes.length === 0) return 0;
  const itens = await db.select({ solicitacaoId: solicitacaoItens.solicitacaoId, status: solicitacaoItens.status, chegou: solicitacaoItens.chegou })
    .from(solicitacaoItens).where(inArray(solicitacaoItens.solicitacaoId, pendentes.map((p) => p.id)));
  let enviadas = 0;
  for (const p of pendentes) {
    const anda = itens.some((i) => i.solicitacaoId === p.id && i.status !== "reprovado" && !i.chegou);
    if (anda && (await enviarSolicitacaoAoErp(p.id))) enviadas++;
  }
  return enviadas;
}

type ItemErp = { id_externo: string | null; aprovacao: string | null; motivo: string | null; comprado: boolean; previsao_entrega: string | null; chegou: boolean };

/**
 * Traz do ERP a situação dos itens das solicitações já enviadas que ainda andam (aprovação, motivo, comprado,
 * previsão) e guarda aqui, para a tela e o resumo. Tempo curto: ERP fora do ar, a tela mostra o que já sabia.
 */
export async function sincronizarSolicitacoesDoErp(organizationId: number): Promise<void> {
  if (!erpConfigurado()) return;
  const ligacao = await ligacaoDaEmpresa(organizationId);
  if (!ligacao) return;
  const abertas = await db
    .select({ id: solicitacoes.id })
    .from(solicitacoes)
    .where(and(eq(solicitacoes.organizationId, organizationId), eq(solicitacoes.status, "aberta"), isNotNull(solicitacoes.erpEnviadaEm)))
    .limit(200);
  if (abertas.length === 0) return;
  let dados: { solicitacoes: { id_externo: string; itens: ItemErp[] }[] };
  try {
    const resposta = await chamarErp(`/api/solicitacoes-compra?ids=${encodeURIComponent(abertas.map((a) => idExterno(a.id)).join(","))}`,
      { signal: AbortSignal.timeout(4_000) }, ligacao);
    if (!resposta.ok) return;
    dados = await resposta.json();
  } catch {
    return;
  }
  const locais = await db.select({ id: solicitacaoItens.id, chegou: solicitacaoItens.chegou }).from(solicitacaoItens)
    .where(inArray(solicitacaoItens.solicitacaoId, abertas.map((a) => a.id)));
  const chegouAqui = new Set(locais.filter((l) => l.chegou).map((l) => l.id));
  for (const sol of dados.solicitacoes) {
    const solicitacaoId = Number(sol.id_externo.replace("checklist-sol-", ""));
    for (const it of sol.itens) {
      const itemId = Number(it.id_externo);
      if (!Number.isInteger(itemId) || !it.aprovacao) continue;
      // o ok da chegada que não chegou ao ERP (fora do ar na hora) vai de novo
      if (chegouAqui.has(itemId) && !it.chegou) await enviarChegadaAoErp(solicitacaoId, itemId, true);
      await db.update(solicitacaoItens)
        .set({
          status: it.aprovacao as "pendente" | "aprovado" | "reprovado",
          motivoReprovacao: it.aprovacao === "reprovado" ? it.motivo : null,
          comprado: it.comprado,
          dataPrevistaEntrega: it.previsao_entrega,
          ...(it.chegou ? { chegou: true } : {}),
        })
        .where(and(eq(solicitacaoItens.id, itemId), eq(solicitacaoItens.solicitacaoId, solicitacaoId)));
    }
  }
}

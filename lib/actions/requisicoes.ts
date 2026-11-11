"use server";

import { isGestorProfile } from "@/lib/auth/profile";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { cancelarExcluidaNoErp, definirDestinos, enviarPendentesAoErp, enviarRequisicaoAoErp } from "@/lib/erp/integracao";
import { enviarAcompanhamentoPendente } from "@/lib/erp/ocorrencias";
import { getCurrentUser } from "@/lib/auth/dal";
import { resolveEffectiveUnitId } from "@/lib/auth/covering-unit";
import { canConferirRequisicao, canRequestExterna, canRequestInterna } from "@/lib/auth/requisicoes";
import type { RequisicaoTipo } from "@/lib/auth/requisicoes";
import { db } from "@/lib/db";
import { enviarPush, idsDosGerentesDaUnidade, idsDosGestores } from "@/lib/push";
import { requisicoes, requisicaoItens, catalogItems, catalogUnitMeasureEnum } from "@/lib/db/schema";
import { addHistoryEntry } from "@/lib/data/history";
import { resolveRequisicaoScope, linkWindowCutoff } from "@/lib/data/requisicoes";
import { checklistDayForInstant, checklistDayISO } from "@/lib/date-utils";

export type ActionState = { error?: string } | undefined;

const UNIT_MEASURES = catalogUnitMeasureEnum.enumValues;

function isValidUnitMeasure(value: string): value is (typeof UNIT_MEASURES)[number] {
  return (UNIT_MEASURES as readonly string[]).includes(value);
}

function revalidateRequisicaoViews() {
  revalidatePath("/requisicoes");
}

/**
 * Leva ao ERP a fase nova da requisição (lançada, editada, conferida,
 * cancelada) depois da resposta: nada aqui espera o ERP, e se ele estiver
 * fora do ar fica pendente e vai na próxima. Aproveita para levar o que
 * tinha ficado para trás.
 */
function sincronizarComErp(id: number, organizationId: number) {
  after(async () => {
    try {
      await enviarRequisicaoAoErp(id);
      await enviarPendentesAoErp(organizationId, 10);
      await enviarAcompanhamentoPendente(organizationId, 20);
    } catch (erro) {
      console.error("Envio da requisição ao ERP falhou:", erro);
    }
  });
}

type ParsedItem = {
  catalogItemId: number | null;
  nome: string;
  unidadeMedida: (typeof UNIT_MEASURES)[number];
  qtdPedida: number;
};

function parseItens(formData: FormData): ParsedItem[] {
  const raw = String(formData.get("itensJson") ?? "[]");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((entry) => ({
      catalogItemId:
        typeof entry?.catalogItemId === "number" && entry.catalogItemId > 0
          ? entry.catalogItemId
          : null,
      nome: typeof entry?.nome === "string" ? entry.nome.trim() : "",
      unidadeMedida: String(entry?.unidadeMedida ?? ""),
      qtdPedida: Number(entry?.qtdPedida),
    }))
    .filter(
      (item): item is ParsedItem =>
        item.nome.length > 0 &&
        isValidUnitMeasure(item.unidadeMedida) &&
        Number.isFinite(item.qtdPedida) &&
        item.qtdPedida > 0,
    );
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Grava os itens da requisição. O catalogItemId vem do navegador, de um
 * catálogo carregado quando a tela abriu: se nesse meio-tempo o item saiu
 * do catálogo (ex: o espelho do ERP juntou ou excluiu duplicados), a
 * chave estrangeira recusava o insert. Como o cabeçalho já tinha sido
 * gravado, sobrava uma requisição sem itens e a pessoa via "confira a
 * internet", tentava de novo e criava outra vazia. Item que não existe
 * mais vai sem vínculo (o nome e a unidade ficam gravados no item).
 */
async function gravarItens(tx: Tx, requisicaoId: number, organizationId: number, itens: ParsedItem[]) {
  const ids = [...new Set(itens.map((i) => i.catalogItemId).filter((id): id is number => id !== null))];
  const existentes = ids.length
    ? new Set(
        (
          await tx
            .select({ id: catalogItems.id })
            .from(catalogItems)
            .where(and(inArray(catalogItems.id, ids), eq(catalogItems.organizationId, organizationId)))
        ).map((r) => r.id),
      )
    : new Set<number>();

  await tx.insert(requisicaoItens).values(
    itens.map((item) => ({
      requisicaoId,
      catalogItemId: item.catalogItemId !== null && existentes.has(item.catalogItemId) ? item.catalogItemId : null,
      nome: item.nome.slice(0, 255),
      unidadeMedida: item.unidadeMedida,
      qtdPedida: item.qtdPedida.toFixed(3),
    })),
  );
}

export async function createRequisicao(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();

  const tipo = String(formData.get("tipo") ?? "");
  if (tipo !== "interna" && tipo !== "externa") {
    return { error: "Selecione o tipo de requisição" };
  }
  if (tipo === "interna" && !canRequestInterna(user)) {
    return { error: "Você não tem permissão para criar requisição interna" };
  }
  if (tipo === "externa" && !canRequestExterna(user)) {
    return { error: "Você não tem permissão para criar requisição externa" };
  }

  // Unidade efetiva do dia — quem está cobrindo outra unidade cria pra
  // lá, não pra unidade de origem. Quem não tem unidade fixa (hoje,
  // Gestor) escolhe na hora.
  let unitId = await resolveEffectiveUnitId(user);
  if (!unitId) {
    const rawUnitId = Number(formData.get("unitId"));
    if (!rawUnitId) {
      return { error: "Selecione a unidade" };
    }
    unitId = rawUnitId;
  }

  const urgente = formData.get("urgente") === "on";
  const observacao = String(formData.get("observacao") ?? "").trim();
  const itens = parseItens(formData);

  if (itens.length === 0) {
    return { error: "Selecione ao menos um item" };
  }

  // Excedente de uma requisição já enviada (esqueceram um item, ou
  // pediram pouco e precisaram de mais depois) — em vez de editar o
  // pedido original e perder o rastro do que foi previsto vs. do que
  // faltou, isso só linka as duas pra quem confere ver junto. Não trava
  // no dia de checklist atual: o pedido normalmente foi enviado no dia
  // anterior e só é separado no seguinte (mesma janela de
  // getRequisicoesForLink).
  if (!user.organizationId) return { error: "Conta sem empresa associada" };

  const rawRelatedId = Number(formData.get("relatedRequisicaoId"));
  let relatedRequisicaoId: number | null = null;
  if (rawRelatedId) {
    const [related] = await db
      .select({ id: requisicoes.id, tipo: requisicoes.tipo, unitId: requisicoes.unitId, createdAt: requisicoes.createdAt })
      .from(requisicoes)
      .where(and(eq(requisicoes.id, rawRelatedId), eq(requisicoes.organizationId, user.organizationId)))
      .limit(1);
    if (
      related &&
      related.tipo === tipo &&
      related.unitId === unitId &&
      related.createdAt >= linkWindowCutoff()
    ) {
      relatedRequisicaoId = related.id;
    }
  }

  // Cabeçalho e itens juntos: se os itens falharem, a requisição não fica
  // gravada vazia.
  const organizationId = user.organizationId;
  let requisicao: { id: number };
  try {
    requisicao = await db.transaction(async (tx) => {
      const [nova] = await tx
        .insert(requisicoes)
        .values({
          organizationId,
          tipo,
          unitId,
          requesterId: user.id,
          urgente,
          observacao,
          relatedRequisicaoId,
          // lançou = o ERP já vê como aberta
          erpStatus: "pendente",
        })
        .returning({ id: requisicoes.id });
      await gravarItens(tx, nova.id, organizationId, itens);
      return nova;
    });
  } catch (erro) {
    console.error("Criar requisição falhou:", erro);
    return { error: "Não foi possível salvar a requisição. Atualize a página e tente de novo." };
  }

  await addHistoryEntry(
    user.id,
    `Requisição ${tipo} criada (${itens.length} ${itens.length === 1 ? "item" : "itens"})`,
    "completed",
  );

  after(async () => {
    const alvos = [...new Set([...(await idsDosGestores(user.organizationId!, user.id)), ...(await idsDosGerentesDaUnidade(unitId, user.id))])];
    await enviarPush(alvos, {
      titulo: urgente ? "Requisição urgente para conferir" : "Requisição para conferir",
      corpo: `${user.name} pediu ${itens.length} ${itens.length === 1 ? "item" : "itens"} (${tipo}).`,
      url: "/requisicoes",
      tag: `requisicao-${requisicao.id}`,
    });
  });

  // externa: o que vai pro Empório e o que vai pra Compras (o ERP diz como cada item chega)
  await definirDestinos(requisicao.id);
  sincronizarComErp(requisicao.id, user.organizationId);
  revalidateRequisicaoViews();
}

/** Editável só pelo próprio solicitante, enquanto "aberta" e só até o dia
 * de checklist virar (02:00 BRT) — depois disso, mesmo ainda "aberta",
 * não dá mais pra editar (só cancelar). */
function podeEditar(existing: { requesterId: number; status: string; createdAt: Date }, userId: number) {
  return (
    existing.requesterId === userId &&
    existing.status === "aberta" &&
    checklistDayForInstant(existing.createdAt) === checklistDayISO()
  );
}

export async function updateRequisicao(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  const id = Number(formData.get("id"));
  if (!id || !user.organizationId) return { error: "Requisição inválida" };

  const [existing] = await db
    .select()
    .from(requisicoes)
    .where(and(eq(requisicoes.id, id), eq(requisicoes.organizationId, user.organizationId)))
    .limit(1);
  if (!existing) return { error: "Requisição não encontrada" };
  if (!podeEditar(existing, user.id)) {
    return { error: "Essa requisição não pode mais ser editada — o dia já virou ou ela já foi conferida/cancelada." };
  }

  const urgente = formData.get("urgente") === "on";
  const observacao = String(formData.get("observacao") ?? "").trim();
  const itens = parseItens(formData);

  if (itens.length === 0) {
    return { error: "Selecione ao menos um item" };
  }

  // Apaga e regrava os itens numa transação só: antes, se o insert
  // falhasse, a requisição perdia todos os itens.
  const organizationId = user.organizationId;
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(requisicoes)
        .set({ urgente, observacao, editedAt: new Date(), erpStatus: "pendente" })
        .where(eq(requisicoes.id, id));
      await tx.delete(requisicaoItens).where(eq(requisicaoItens.requisicaoId, id));
      await gravarItens(tx, id, organizationId, itens);
    });
  } catch (erro) {
    console.error("Editar requisição falhou:", erro);
    return { error: "Não foi possível salvar a requisição. Atualize a página e tente de novo." };
  }

  await definirDestinos(id);
  sincronizarComErp(id, user.organizationId);
  revalidateRequisicaoViews();
}

export async function cancelRequisicao(formData: FormData) {
  const user = await getCurrentUser();
  const id = Number(formData.get("id"));
  if (!id || !user.organizationId) return;

  const [existing] = await db
    .select()
    .from(requisicoes)
    .where(and(eq(requisicoes.id, id), eq(requisicoes.organizationId, user.organizationId)))
    .limit(1);
  if (!existing || existing.requesterId !== user.id || existing.status !== "aberta") return;

  await db
    .update(requisicoes)
    .set({ status: "cancelada", concluidoEm: new Date(), erpStatus: "pendente" })
    .where(eq(requisicoes.id, id));

  sincronizarComErp(id, user.organizationId);
  revalidateRequisicaoViews();
}

/** Exclusão definitiva — só Gestor, diferente de cancelar (que qualquer
 * solicitante faz na própria requisição "aberta" e mantém o registro).
 * requisicaoItens vai junto via onDelete cascade; excedentes ligados a
 * essa aqui (related_requisicao_id) ficam com o vínculo nulo em vez de
 * também serem apagados. Retorna erro em vez de void (como as outras
 * ações desta tela) pra falha ficar visível na UI em vez de "não
 * acontecer nada". */
export async function deleteRequisicao(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!isGestorProfile(user.profile)) {
    return { error: "Só o gestor pode excluir uma requisição" };
  }

  const id = Number(formData.get("id"));
  if (!id || !user.organizationId) return { error: "Requisição inválida" };

  await db
    .delete(requisicoes)
    .where(and(eq(requisicoes.id, id), eq(requisicoes.organizationId, user.organizationId)));

  // excluída aqui: a aberta no ERP é cancelada (a já conferida fica, com a baixa)
  after(() => cancelarExcluidaNoErp(id).catch((erro) => console.error("Cancelar no ERP falhou:", erro)));
  revalidateRequisicaoViews();
}

/** Corrige o tipo (interna/externa) de uma requisição já enviada — só
 * Gestor, em qualquer status. Existe pra consertar lançamento errado
 * (ex: pediram externa quando era pra ser interna); não reabre a janela
 * de edição normal nem mexe nos itens/conferência já registrados. */
export async function updateRequisicaoTipo(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!isGestorProfile(user.profile)) {
    return { error: "Só o gestor pode mudar o tipo de uma requisição" };
  }

  const id = Number(formData.get("id"));
  const tipo = String(formData.get("tipo") ?? "");
  if (!id || !user.organizationId) return { error: "Requisição inválida" };
  if (tipo !== "interna" && tipo !== "externa") {
    return { error: "Selecione o tipo de requisição" };
  }

  await db
    .update(requisicoes)
    .set({ tipo, erpStatus: "pendente" })
    .where(and(eq(requisicoes.id, id), eq(requisicoes.organizationId, user.organizationId)));

  // o tipo decide o local de onde sai no ERP (vale enquanto lá estiver aberta)
  // e, na externa, o que vai pro Empório e o que vai pra Compras
  await definirDestinos(id);
  sincronizarComErp(id, user.organizationId);
  revalidateRequisicaoViews();
}

export async function conferirRequisicao(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();

  const id = Number(formData.get("id"));
  if (!user.organizationId) return { error: "Conta sem empresa associada" };
  const [existing] = await db
    .select()
    .from(requisicoes)
    .where(and(eq(requisicoes.id, id), eq(requisicoes.organizationId, user.organizationId)))
    .limit(1);
  if (!existing) return { error: "Requisição não encontrada" };
  if (!canConferirRequisicao(user, existing.tipo as RequisicaoTipo)) {
    return { error: "Você não tem permissão para conferir essa requisição" };
  }

  // canConferirRequisicao só olha o cargo — quem confere por unidade
  // (Gerente, Líder de Delivery, Líder de Estoque/Produção) só pode
  // conferir requisições da própria unidade efetiva do dia, mesma regra
  // já aplicada na listagem e no PDF. Gestor (scope "all") confere de
  // qualquer unidade.
  const effectiveUnitId = await resolveEffectiveUnitId(user);
  const scope = resolveRequisicaoScope({ ...user, unitId: effectiveUnitId }, existing.tipo);
  const podeConferir =
    scope?.mode === "all" || (scope?.mode === "unit" && scope.unitIds.includes(existing.unitId));
  if (!podeConferir) {
    return { error: "Você não tem permissão para conferir essa requisição" };
  }

  if (existing.status !== "aberta") {
    return { error: "Essa requisição já foi conferida" };
  }

  const itens = await db
    .select()
    .from(requisicaoItens)
    .where(eq(requisicaoItens.requisicaoId, id));

  for (const item of itens) {
    // o que vai por Compras não passa pelo Empório: não se confere aqui
    if (existing.tipo === "externa" && item.destino === "compras") continue;
    const raw = formData.get(`qtd-${item.id}`);
    const qtdConferida = raw !== null ? Number(raw) : Number(item.qtdPedida);
    if (!Number.isFinite(qtdConferida) || qtdConferida < 0) {
      return { error: "Quantidade conferida inválida" };
    }
    await db
      .update(requisicaoItens)
      .set({ qtdConferida: qtdConferida.toFixed(3) })
      .where(and(eq(requisicaoItens.id, item.id), eq(requisicaoItens.requisicaoId, id)));
  }

  await db
    .update(requisicoes)
    .set({
      status: "conferida",
      conferidoPorId: user.id,
      concluidoEm: new Date(),
      // conferiu = saiu do estoque: entra na fila do ERP
      erpStatus: "pendente",
    })
    .where(eq(requisicoes.id, id));

  // A baixa no ERP vai depois da resposta: a conferência nunca espera o ERP.
  sincronizarComErp(id, user.organizationId);

  if (existing.tipo === "externa" && existing.requesterId !== user.id) {
    after(() =>
      enviarPush([existing.requesterId], {
        titulo: "Requisição conferida",
        corpo: "Confirme o que chegou na sua unidade.",
        url: "/requisicoes",
        tag: `requisicao-${id}`,
      }),
    );
  }

  await addHistoryEntry(
    user.id,
    `Requisição ${existing.tipo} conferida (unidade ${existing.unitId})`,
    "completed",
  );

  revalidateRequisicaoViews();
}

/**
 * Recebido pela unidade (só externa): depois da conferência, o Gerente da
 * unidade que pediu (ou o Gestor) confirma o que chegou. Não mexe no
 * estoque do ERP; fica no histórico e no PDF, com a diferença à vista.
 */
export async function receberRequisicao(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  const id = Number(formData.get("id"));
  if (!id || !user.organizationId) return { error: "Requisição inválida" };

  const [existing] = await db
    .select()
    .from(requisicoes)
    .where(and(eq(requisicoes.id, id), eq(requisicoes.organizationId, user.organizationId)))
    .limit(1);
  if (!existing) return { error: "Requisição não encontrada" };
  if (existing.tipo !== "externa") return { error: "Só a requisição externa tem recebimento" };
  if (existing.status !== "conferida") return { error: "A requisição ainda não foi conferida" };
  if (existing.recebidoEm) return { error: "Essa requisição já foi recebida" };

  const effectiveUnitId = await resolveEffectiveUnitId(user);
  const daUnidade =
    user.profile === "gerente" &&
    (effectiveUnitId === existing.unitId || (user.requisicaoUnidadesExtras ?? []).includes(existing.unitId));
  if (!daUnidade && !isGestorProfile(user.profile)) {
    return { error: "Só o gerente da unidade que pediu pode confirmar o recebimento" };
  }

  const itens = await db.select().from(requisicaoItens).where(eq(requisicaoItens.requisicaoId, id));
  for (const item of itens) {
    if (item.destino === "compras") continue; // chega por compra direta, não passa pelo Empório
    const raw = formData.get(`qtd-${item.id}`);
    const qtd = raw !== null ? Number(raw) : Number(item.qtdConferida ?? item.qtdPedida);
    if (!Number.isFinite(qtd) || qtd < 0) return { error: "Quantidade recebida inválida" };
    await db
      .update(requisicaoItens)
      .set({ qtdRecebida: qtd.toFixed(3) })
      .where(and(eq(requisicaoItens.id, item.id), eq(requisicaoItens.requisicaoId, id)));
  }

  await db
    .update(requisicoes)
    .set({
      recebidoEm: new Date(),
      recebidoPorId: user.id,
      recebimentoObs: String(formData.get("obs") ?? "").trim() || null,
    })
    .where(eq(requisicoes.id, id));

  await addHistoryEntry(user.id, `Requisição externa recebida (unidade ${existing.unitId})`, "completed");
  revalidateRequisicaoViews();
}

/**
 * Master (donos da plataforma): confere de uma vez as requisições INTERNAS abertas de uma unidade, dando como conferido o que foi pedido.
 * Sem `executar`, só conta (para a tela pedir a confirmação). Requisições sem itens ficam de fora, para o Gestor
 * excluir pela tela.
 */
export async function conferirInternasEmLote(unidadeId: number, executar: boolean): Promise<{ error?: string; total?: number; feitas?: number }> {
  const user = await getCurrentUser();
  if (user.profile !== "master" || !user.organizationId) return { error: "A conferência em lote é restrita ao perfil master." };
  const abertas = await db
    .select({ id: requisicoes.id })
    .from(requisicoes)
    .where(and(eq(requisicoes.organizationId, user.organizationId), eq(requisicoes.unitId, unidadeId), eq(requisicoes.tipo, "interna"), eq(requisicoes.status, "aberta")));
  const ids = abertas.map((r) => r.id);
  const itens = ids.length ? await db.select().from(requisicaoItens).where(inArray(requisicaoItens.requisicaoId, ids)) : [];
  const comItens = ids.filter((id) => itens.some((i) => i.requisicaoId === id));
  if (!executar) return { total: comItens.length };
  let feitas = 0;
  for (const id of comItens) {
    // confere de novo só se ainda está aberta (outra pessoa pode ter conferido no meio)
    const [ainda] = await db.select({ status: requisicoes.status }).from(requisicoes).where(eq(requisicoes.id, id)).limit(1);
    if (ainda?.status !== "aberta") continue;
    for (const item of itens.filter((i) => i.requisicaoId === id)) {
      await db.update(requisicaoItens).set({ qtdConferida: Number(item.qtdPedida).toFixed(3) }).where(eq(requisicaoItens.id, item.id));
    }
    await db.update(requisicoes).set({ status: "conferida", conferidoPorId: user.id, concluidoEm: new Date(), erpStatus: "pendente" }).where(eq(requisicoes.id, id));
    sincronizarComErp(id, user.organizationId);
    feitas++;
  }
  await addHistoryEntry(user.id, `Conferência em lote: ${feitas} requisições internas (unidade ${unidadeId})`, "completed");
  revalidateRequisicaoViews();
  return { total: comItens.length, feitas };
}

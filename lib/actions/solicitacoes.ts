"use server";

import { isGestorProfile } from "@/lib/auth/profile";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/dal";
import { resolveEffectiveUnitId } from "@/lib/auth/covering-unit";
import { canCreateSolicitacao } from "@/lib/auth/solicitacoes";
import { db } from "@/lib/db";
import { solicitacoes, solicitacaoItens } from "@/lib/db/schema";
import { cancelarSolicitacaoNoErp, enviarChegadaAoErp, enviarSolicitacaoAoErp } from "@/lib/erp/solicitacoes";
import { ligacaoDaEmpresa } from "@/lib/erp/integracao";
import { after } from "next/server";

export type ActionState = { error?: string } | undefined;

function revalidateSolicitacaoViews() {
  revalidatePath("/solicitacoes");
}

type ParsedItem = { nome: string; quantidade: number };

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
      nome: typeof entry?.nome === "string" ? entry.nome.trim() : "",
      quantidade: Number(entry?.quantidade),
    }))
    .filter(
      (item): item is ParsedItem =>
        item.nome.length > 0 && Number.isFinite(item.quantidade) && item.quantidade > 0,
    );
}

export async function createSolicitacao(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();

  if (!canCreateSolicitacao(user)) {
    return { error: "Você não tem permissão para criar uma solicitação" };
  }

  // Unidade efetiva do dia — quem está cobrindo outra unidade pede pra
  // lá. Quem não tem unidade fixa (hoje, Gestor) escolhe na hora, via
  // unitId no formulário.
  let effectiveUnitId = await resolveEffectiveUnitId(user);
  if (!effectiveUnitId) {
    const rawUnitId = Number(formData.get("unitId"));
    if (!rawUnitId) {
      return { error: "Selecione a unidade" };
    }
    effectiveUnitId = rawUnitId;
  }

  const date = String(formData.get("date") ?? "").trim();
  const urgente = formData.get("urgente") === "on";
  const observacao = String(formData.get("observacao") ?? "").trim();
  const itens = parseItens(formData);

  if (!date) return { error: "Informe a data" };
  if (itens.length === 0) return { error: "Selecione ao menos um item" };

  if (!user.organizationId) return { error: "Conta sem empresa associada" };

  const [solicitacao] = await db
    .insert(solicitacoes)
    .values({
      organizationId: user.organizationId,
      unitId: effectiveUnitId,
      requesterId: user.id,
      date,
      urgente,
      observacao,
    })
    .returning({ id: solicitacoes.id });

  await db.insert(solicitacaoItens).values(
    itens.map((item) => ({
      solicitacaoId: solicitacao.id,
      nome: item.nome,
      quantidade: item.quantidade,
    })),
  );

  // vai para o ERP, onde se aprova e compra; fora do ar, vai na próxima sincronização
  await enviarSolicitacaoAoErp(solicitacao.id);
  revalidateSolicitacaoViews();
}

/** Cancela o pedido inteiro — só quem pediu, e só enquanto nada foi
 * decidido ainda (nenhum item aprovado/reprovado). Depois que o gestor
 * começou a decidir item a item, não dá mais pra retirar de uma vez. */
export async function cancelSolicitacao(formData: FormData) {
  const user = await getCurrentUser();
  const id = Number(formData.get("id"));
  if (!id || !user.organizationId) return;

  const [existing] = await db
    .select()
    .from(solicitacoes)
    .where(and(eq(solicitacoes.id, id), eq(solicitacoes.organizationId, user.organizationId)))
    .limit(1);
  if (!existing || existing.requesterId !== user.id || existing.status !== "aberta") return;

  const itens = await db
    .select({ status: solicitacaoItens.status })
    .from(solicitacaoItens)
    .where(eq(solicitacaoItens.solicitacaoId, id));
  if (itens.some((i) => i.status !== "pendente")) return;

  await db.update(solicitacoes).set({ status: "cancelada" }).where(and(eq(solicitacoes.id, id), eq(solicitacoes.organizationId, user.organizationId)));
  after(async () => cancelarSolicitacaoNoErp(id, await ligacaoDaEmpresa(user.organizationId)));
  revalidateSolicitacaoViews();
}

/** Exclusão definitiva — só Gestor, diferente de cancelar. */
export async function deleteSolicitacao(formData: FormData) {
  const user = await getCurrentUser();
  if (!isGestorProfile(user.profile) || !user.organizationId) return;
  const id = Number(formData.get("id"));
  if (!id) return;
  const deleted = await db
    .delete(solicitacoes)
    .where(and(eq(solicitacoes.id, id), eq(solicitacoes.organizationId, user.organizationId)))
    .returning({ id: solicitacoes.id });
  // Só avisa o ERP se a exclusão autorizada aconteceu de fato.
  if (deleted.length === 0) return;
  after(async () => cancelarSolicitacaoNoErp(id, await ligacaoDaEmpresa(user.organizationId)));
  revalidateSolicitacaoViews();
}

/** Marca a chegada de um item — quem pediu (acompanhando o próprio
 * pedido) ou o gestor. A aprovação, a compra e a previsão de entrega
 * ficam no ERP (Compras › Solicitações), desde 22/10/2026. */
export async function setItemChegou(formData: FormData) {
  const user = await getCurrentUser();
  const itemId = Number(formData.get("itemId"));
  const solicitacaoId = Number(formData.get("solicitacaoId"));
  if (!itemId || !solicitacaoId) return;

  if (!user.organizationId) return;
  const [existing] = await db
    .select({ requesterId: solicitacoes.requesterId })
    .from(solicitacoes)
    .where(and(eq(solicitacoes.id, solicitacaoId), eq(solicitacoes.organizationId, user.organizationId)))
    .limit(1);
  if (!existing) return;
  if (existing.requesterId !== user.id && !isGestorProfile(user.profile)) return;

  const chegou = formData.get("chegou") === "on";
  await db.update(solicitacaoItens).set({ chegou }).where(and(eq(solicitacaoItens.id, itemId), eq(solicitacaoItens.solicitacaoId, solicitacaoId)));
  // o ERP fecha a solicitação quando tudo chegou; fora do ar, a sincronização manda de novo
  await enviarChegadaAoErp(solicitacaoId, itemId, chegou);

  revalidateSolicitacaoViews();
}

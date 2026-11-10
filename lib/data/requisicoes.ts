import "server-only";
import { isGestorProfile } from "@/lib/auth/profile";
import { and, asc, desc, eq, gte, inArray, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { requisicoes, requisicaoItens, units, users } from "@/lib/db/schema";
import { canConferirInterna, canConferirExterna, tiposPermitidos } from "@/lib/auth/requisicoes";
import { checklistDayForInstant, checklistDayISO } from "@/lib/date-utils";

// Uma requisição interna costuma ser enviada num dia e separada/conferida
// no outro (ex: pedida à noite, montada de manhã) — então "excedente de
// algo já enviado" não pode ficar preso ao dia de checklist atual. Isso
// só limita o quão pra trás a lista de vínculo/validação olha, pra não
// listar (ou aceitar) coisa muito antiga.
const LINK_WINDOW_DAYS = 3;
export function linkWindowCutoff() {
  return new Date(Date.now() - LINK_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

export type RequisicaoViewer = {
  id: number;
  profile: string;
  unitId: number | null;
  jobFunctionName: string | null;
  /** Unidades extras (Gerenciar) cujas requisições a pessoa também vê e confere. */
  requisicaoUnidadesExtras?: number[];
};

export type RequisicaoScope =
  | { mode: "unit"; unitId: number; unitIds: number[] }
  | { mode: "all" }
  | { mode: "own"; userId: number; unitId: number };

/**
 * Quem confere interna (Gerente, Líder de Delivery, Líder de
 * Estoque/Produção) vê todas as requisições — interna e externa — da
 * própria unidade, não só as que criou. Gestor não opera uma unidade
 * fixa: vê tudo, de todas as unidades. Quem só pode criar (cargos de
 * praça) vê as próprias. rh não tem fila de requisição — ver
 * spec-requisicao-kenkyo.md seção 3 e lib/auth/requisicoes.ts.
 *
 * `viewer.unitId` já deve vir resolvido pela unidade efetiva do dia
 * (resolveEffectiveUnitId) — quem está cobrindo outra unidade hoje vê e
 * cria requisições da unidade coberta, não da unidade de origem.
 */
export function resolveRequisicaoScope(
  viewer: RequisicaoViewer,
  tipo?: string | null,
): RequisicaoScope | null {
  if (isGestorProfile(viewer.profile)) {
    return { mode: "all" };
  }
  // A externa é pedida pelas unidades e atendida pelo Líder de
  // Estoque/Produção, que fica numa unidade só: ele vê as externas de todas.
  if (tipo === "externa" && canConferirExterna(viewer)) {
    return { mode: "all" };
  }
  if (canConferirInterna(viewer)) {
    const principal = viewer.unitId ?? -1;
    return { mode: "unit", unitId: principal, unitIds: [...new Set([principal, ...(viewer.requisicaoUnidadesExtras ?? [])])] };
  }
  if (tiposPermitidos(viewer).length === 0) return null;
  return { mode: "own", userId: viewer.id, unitId: viewer.unitId ?? -1 };
}

function baseQuery() {
  return db
    .select({
      id: requisicoes.id,
      tipo: requisicoes.tipo,
      unitId: requisicoes.unitId,
      unitName: units.name,
      requesterId: requisicoes.requesterId,
      requesterName: users.name,
      urgente: requisicoes.urgente,
      observacao: requisicoes.observacao,
      status: requisicoes.status,
      conferidoPorId: requisicoes.conferidoPorId,
      relatedRequisicaoId: requisicoes.relatedRequisicaoId,
      createdAt: requisicoes.createdAt,
      editedAt: requisicoes.editedAt,
      concluidoEm: requisicoes.concluidoEm,
      recebidoEm: requisicoes.recebidoEm,
      recebimentoObs: requisicoes.recebimentoObs,
    })
    .from(requisicoes)
    .innerJoin(units, eq(units.id, requisicoes.unitId))
    .innerJoin(users, eq(users.id, requisicoes.requesterId));
}

/** Contexto mínimo da requisição original pra quem vê o excedente saber
 * o que ela complementa, sem precisar abrir as duas ao mesmo tempo. */
async function fetchRelatedInfo(relatedIds: number[]) {
  if (relatedIds.length === 0) return new Map<number, { createdAt: Date; requesterName: string }>();
  const rows = await db
    .select({ id: requisicoes.id, createdAt: requisicoes.createdAt, requesterName: users.name })
    .from(requisicoes)
    .innerJoin(users, eq(users.id, requisicoes.requesterId))
    .where(inArray(requisicoes.id, relatedIds));
  return new Map(rows.map((r) => [r.id, { createdAt: r.createdAt, requesterName: r.requesterName }]));
}

export async function getRequisicoesByScope(
  scope: RequisicaoScope,
  organizationId: number,
  tipo?: string | null,
) {
  const conditions = [
    eq(requisicoes.organizationId, organizationId),
    scope.mode === "unit"
      ? inArray(requisicoes.unitId, scope.unitIds)
      : scope.mode === "own"
        ? eq(requisicoes.requesterId, scope.userId)
        : undefined, // "all": todas as unidades da empresa, sem filtro de solicitante
    tipo === "interna" || tipo === "externa" ? eq(requisicoes.tipo, tipo) : undefined,
  ].filter((c) => c !== undefined);

  const records = await baseQuery()
    .where(and(...conditions))
    .orderBy(desc(requisicoes.createdAt));

  if (records.length === 0) return [];

  const ids = records.map((r) => r.id);
  const allItens = await db
    .select()
    .from(requisicaoItens)
    .where(inArray(requisicaoItens.requisicaoId, ids));
  const itensByRequisicao = new Map<number, typeof allItens>();
  for (const item of allItens) {
    const list = itensByRequisicao.get(item.requisicaoId) ?? [];
    list.push(item);
    itensByRequisicao.set(item.requisicaoId, list);
  }

  const relatedIds = records
    .map((r) => r.relatedRequisicaoId)
    .filter((id): id is number => id !== null);
  const relatedById = await fetchRelatedInfo(relatedIds);

  return records.map((r) => ({
    ...r,
    itens: itensByRequisicao.get(r.id) ?? [],
    podeEditar: canEditToday(r),
    related: r.relatedRequisicaoId ? (relatedById.get(r.relatedRequisicaoId) ?? null) : null,
  }));
}

/** Requisições recentes (mesma unidade e tipo, não canceladas) que podem
 * ser apontadas como "original" ao criar um excedente — usado pelo
 * seletor na Nova Requisição. Não trava no dia de checklist atual: o
 * pedido normalmente foi enviado no dia anterior e só é separado/
 * conferido no dia seguinte. */
export async function getRequisicoesForLink(unitId: number, tipo: string, organizationId: number) {
  if (tipo !== "interna" && tipo !== "externa") return [];
  return db
    .select({
      id: requisicoes.id,
      createdAt: requisicoes.createdAt,
      requesterName: users.name,
    })
    .from(requisicoes)
    .innerJoin(users, eq(users.id, requisicoes.requesterId))
    .where(
      and(
        eq(requisicoes.organizationId, organizationId),
        eq(requisicoes.unitId, unitId),
        eq(requisicoes.tipo, tipo),
        ne(requisicoes.status, "cancelada"),
        gte(requisicoes.createdAt, linkWindowCutoff()),
      ),
    )
    .orderBy(desc(requisicoes.createdAt));
}

/** Editável só enquanto "aberta" e até o dia de checklist virar (02:00
 * BRT) — o solicitante ainda precisa ser conferido no servidor, isso só
 * decide a janela de tempo. */
function canEditToday(r: { status: string; createdAt: Date }) {
  return r.status === "aberta" && checklistDayForInstant(r.createdAt) === checklistDayISO();
}

export async function getRequisicaoWithItens(id: number, organizationId: number) {
  const [requisicao] = await baseQuery()
    .where(and(eq(requisicoes.id, id), eq(requisicoes.organizationId, organizationId)))
    .limit(1);
  if (!requisicao) return null;

  const itens = await db
    .select()
    .from(requisicaoItens)
    .where(eq(requisicaoItens.requisicaoId, id))
    .orderBy(asc(requisicaoItens.id));

  const related = requisicao.relatedRequisicaoId
    ? ((await fetchRelatedInfo([requisicao.relatedRequisicaoId])).get(requisicao.relatedRequisicaoId) ?? null)
    : null;

  return { ...requisicao, itens, podeEditar: canEditToday(requisicao), related };
}

export type RecebimentoComDiferenca = {
  id: number;
  unitName: string;
  recebidoEm: Date;
  recebimentoObs: string | null;
  itens: { nome: string; unidadeMedida: string; enviado: string; recebido: string }[];
};

/** Externas dos últimos 7 dias em que a unidade recebeu menos/mais do que foi enviado. */
export async function getRecebimentosComDiferenca(organizationId: number): Promise<RecebimentoComDiferenca[]> {
  const desde = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      id: requisicoes.id,
      unitName: units.name,
      recebidoEm: requisicoes.recebidoEm,
      recebimentoObs: requisicoes.recebimentoObs,
      nome: requisicaoItens.nome,
      unidadeMedida: requisicaoItens.unidadeMedida,
      conferida: requisicaoItens.qtdConferida,
      recebida: requisicaoItens.qtdRecebida,
    })
    .from(requisicoes)
    .innerJoin(units, eq(units.id, requisicoes.unitId))
    .innerJoin(requisicaoItens, eq(requisicaoItens.requisicaoId, requisicoes.id))
    .where(and(eq(requisicoes.organizationId, organizationId), eq(requisicoes.tipo, "externa"), gte(requisicoes.recebidoEm, desde)))
    .orderBy(desc(requisicoes.recebidoEm));

  const porId = new Map<number, RecebimentoComDiferenca>();
  for (const r of rows) {
    if (r.recebida === null || r.conferida === null || Number(r.recebida) === Number(r.conferida)) continue;
    const atual = porId.get(r.id) ?? { id: r.id, unitName: r.unitName, recebidoEm: r.recebidoEm!, recebimentoObs: r.recebimentoObs, itens: [] };
    atual.itens.push({ nome: r.nome, unidadeMedida: r.unidadeMedida, enviado: r.conferida, recebido: r.recebida });
    porId.set(r.id, atual);
  }
  return [...porId.values()];
}

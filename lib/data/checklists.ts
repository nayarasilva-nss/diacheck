import "server-only";
import { isGestorProfile } from "@/lib/auth/profile";
import { and, asc, eq, inArray } from "drizzle-orm";
import { modelosExtrasDe, tarefasDoColaborador, tarefasEscondidasDe } from "@/lib/data/personalizacao";
import { db } from "@/lib/db";
import {
  checklistTypes,
  checklistTypeItems,
  checklistTypePrerequisites,
  checklistCompletions,
  users,
  units,
  type completionStatusEnum,
} from "@/lib/db/schema";
import { checklistDayISO } from "@/lib/date-utils";

// "Today" for checklist purposes rolls over at 02:00 BRT, not midnight —
// see checklistDayISO() for why. Exported as `todayISO` since that's the
// name every checklist read/write path already imports.
const todayISO = checklistDayISO;
export { todayISO };

export type CompletionStatus = (typeof completionStatusEnum.enumValues)[number];

export type Viewer = {
  profile: string;
  jobFunctionId: number | null;
  organizationId: number;
};

// A jobFunctionId of null on the checklist itself means "visible to
// everyone" (generic/Padrão templates) — for anyone with a real função.
function visibleToViewer(jobFunctionId: number | null, viewer: Viewer) {
  return jobFunctionId === null || jobFunctionId === viewer.jobFunctionId;
}

function checklistVisibleToViewer(
  checklistType: { id: number; jobFunctionId: number | null; assignedUserId: number | null },
  viewer: Viewer & { id: number },
  modelosExtras?: Set<number>,
) {
  // Atribuído a este colaborador além da função dele (Gerenciar > Modelos).
  if (modelosExtras?.has(checklistType.id)) return true;
  if (checklistType.assignedUserId !== null) {
    return checklistType.assignedUserId === viewer.id;
  }
  // Gestor doesn't get every checklist by default, not even the generic
  // ones — viewer.jobFunctionId must already be their *effective* one
  // (resolveEffectiveJobFunctionId), which is null until they pick a
  // função for the day (they're not operating any checklist that day).
  if (isGestorProfile(viewer.profile) && viewer.jobFunctionId === null) {
    return false;
  }
  return visibleToViewer(checklistType.jobFunctionId, viewer);
}

/** Picks, per item, the completion matching the viewer's current
 * effective unit — falling back to their home unit for rows written
 * before covering-unit existed (unitId null). Lets the same person hold
 * separate completion state for their own unit and a unit they're
 * covering today, instead of one overwriting the other. */
function pickByEffectiveUnit<T extends { itemId: number; unitId: number | null }>(
  completions: T[],
  homeUnitId: number | null,
  effectiveUnitId: number | null,
) {
  const map = new Map<number, T>();
  for (const c of completions) {
    if ((c.unitId ?? homeUnitId) === effectiveUnitId) {
      map.set(c.itemId, c);
    }
  }
  return map;
}

/**
 * Checklists configurados como pré-requisito (em Gerenciar > Modelos de
 * Checklist) que ainda não estão 100% respondidos por esse usuário nesse
 * dia — ex: "Fechamento" pode exigir "Abertura" e "Meio de Turno"
 * completos primeiro. Não distingue unidade (qualquer completion do dia
 * conta): a cobertura de unidade é o caso raro aqui, e complicar essa
 * checagem por unidade não valeria o ganho.
 */
export async function getUnmetPrerequisites(
  checklistTypeId: number,
  userId: number,
  date: string = todayISO(),
) {
  const prereqs = await db
    .select({
      requiresChecklistTypeId: checklistTypePrerequisites.requiresChecklistTypeId,
      name: checklistTypes.name,
    })
    .from(checklistTypePrerequisites)
    .innerJoin(
      checklistTypes,
      eq(checklistTypes.id, checklistTypePrerequisites.requiresChecklistTypeId),
    )
    .where(eq(checklistTypePrerequisites.checklistTypeId, checklistTypeId));

  if (prereqs.length === 0) return [];

  const prereqTypeIds = prereqs.map((p) => p.requiresChecklistTypeId);
  const todosItens = await db
    .select({ id: checklistTypeItems.id, checklistTypeId: checklistTypeItems.checklistTypeId, ownerUserId: checklistTypeItems.ownerUserId })
    .from(checklistTypeItems)
    .where(inArray(checklistTypeItems.checklistTypeId, prereqTypeIds));
  const escondidas = (await tarefasEscondidasDe([userId])).get(userId);
  const items = tarefasDoColaborador(todosItens, userId, escondidas);

  const itemIds = items.map((i) => i.id);
  const completions =
    itemIds.length > 0
      ? await db
          .select({ itemId: checklistCompletions.itemId, status: checklistCompletions.status })
          .from(checklistCompletions)
          .where(
            and(
              inArray(checklistCompletions.itemId, itemIds),
              eq(checklistCompletions.userId, userId),
              eq(checklistCompletions.date, date),
            ),
          )
      : [];
  const doneItemIds = new Set(
    completions.filter((c) => c.status !== "pending").map((c) => c.itemId),
  );

  const itemsByType = new Map<number, number[]>();
  for (const item of items) {
    const list = itemsByType.get(item.checklistTypeId) ?? [];
    list.push(item.id);
    itemsByType.set(item.checklistTypeId, list);
  }

  return prereqs
    .filter((p) => {
      const typeItemIds = itemsByType.get(p.requiresChecklistTypeId) ?? [];
      // Um checklist sem itens não bloqueia nada (nada pra completar).
      return typeItemIds.length > 0 && typeItemIds.some((id) => !doneItemIds.has(id));
    })
    .map((p) => ({ id: p.requiresChecklistTypeId, name: p.name }));
}

export async function getChecklistsForUser(
  type: "daily" | "weekly",
  viewer: Viewer & { id: number; unitId: number | null; effectiveUnitId: number | null },
  date: string = todayISO(),
) {
  const allTypes = await db
    .select()
    .from(checklistTypes)
    .where(and(eq(checklistTypes.type, type), eq(checklistTypes.organizationId, viewer.organizationId), eq(checklistTypes.active, true)))
    .orderBy(asc(checklistTypes.id));

  const modelosExtras = (await modelosExtrasDe([viewer.id])).get(viewer.id);
  const types = allTypes.filter((t) => checklistVisibleToViewer(t, viewer, modelosExtras));

  if (types.length === 0) return [];

  const typeIds = types.map((t) => t.id);

  const assignedUserIds = types
    .map((t) => t.assignedUserId)
    .filter((id): id is number => id !== null);
  const assignedUsers =
    assignedUserIds.length > 0
      ? await db
          .select({ id: users.id, name: users.name })
          .from(users)
          .where(inArray(users.id, assignedUserIds))
      : [];
  const assignedUserNameById = new Map(
    assignedUsers.map((u) => [u.id, u.name]),
  );

  const items = tarefasDoColaborador(
    await db
      .select()
      .from(checklistTypeItems)
      .where(inArray(checklistTypeItems.checklistTypeId, typeIds))
      .orderBy(asc(checklistTypeItems.position)),
    viewer.id,
    (await tarefasEscondidasDe([viewer.id])).get(viewer.id),
  );

  const itemIds = items.map((i) => i.id);

  const completions =
    itemIds.length > 0
      ? await db
          .select()
          .from(checklistCompletions)
          .where(
            and(
              inArray(checklistCompletions.itemId, itemIds),
              eq(checklistCompletions.userId, viewer.id),
              eq(checklistCompletions.date, date),
            ),
          )
      : [];

  const completionByItem = pickByEffectiveUnit(completions, viewer.unitId, viewer.effectiveUnitId);
  const itemsByType = new Map<number, typeof items>();
  for (const item of items) {
    const list = itemsByType.get(item.checklistTypeId) ?? [];
    list.push(item);
    itemsByType.set(item.checklistTypeId, list);
  }

  const prerequisitosPorTipo = new Map(
    await Promise.all(
      types.map(
        async (t) =>
          [t.id, await getUnmetPrerequisites(t.id, viewer.id, date)] as const,
      ),
    ),
  );

  return types.map((checklistType) => ({
    id: checklistType.id,
    name: checklistType.name,
    description: checklistType.description,
    assignedUserName: checklistType.assignedUserId
      ? (assignedUserNameById.get(checklistType.assignedUserId) ?? null)
      : null,
    prerequisitosPendentes: (prerequisitosPorTipo.get(checklistType.id) ?? []).map((p) => p.name),
    items: (itemsByType.get(checklistType.id) ?? []).map((item) => {
      const completion = completionByItem.get(item.id);
      return {
        id: item.id,
        label: item.label,
        requiresPhoto: item.requiresPhoto,
        requiresShiftLog: item.requiresShiftLog,
        requiresRequisicao: item.requiresRequisicao,
        requiresContagem: item.requiresContagem,
        status: (completion?.status ?? "pending") as CompletionStatus,
        justification: completion?.justification ?? null,
        photoUrl: completion?.photoUrl ?? null,
      };
    }),
  }));
}

export async function getChecklistForUser(
  checklistTypeId: number,
  viewer: Viewer & { id: number; unitId: number | null; effectiveUnitId: number | null },
  date: string = todayISO(),
) {
  const [checklistType] = await db
    .select()
    .from(checklistTypes)
    .where(
      and(eq(checklistTypes.id, checklistTypeId), eq(checklistTypes.organizationId, viewer.organizationId), eq(checklistTypes.active, true)),
    )
    .limit(1);

  if (!checklistType) return null;
  const modelosExtras = (await modelosExtrasDe([viewer.id])).get(viewer.id);
  if (!checklistVisibleToViewer(checklistType, viewer, modelosExtras)) return null;

  const items = tarefasDoColaborador(
    await db
      .select()
      .from(checklistTypeItems)
      .where(eq(checklistTypeItems.checklistTypeId, checklistTypeId))
      .orderBy(asc(checklistTypeItems.position)),
    viewer.id,
    (await tarefasEscondidasDe([viewer.id])).get(viewer.id),
  );

  const itemIds = items.map((i) => i.id);
  const completions =
    itemIds.length > 0
      ? await db
          .select()
          .from(checklistCompletions)
          .where(
            and(
              inArray(checklistCompletions.itemId, itemIds),
              eq(checklistCompletions.userId, viewer.id),
              eq(checklistCompletions.date, date),
            ),
          )
      : [];
  const completionByItem = pickByEffectiveUnit(completions, viewer.unitId, viewer.effectiveUnitId);

  let assignedUserName: string | null = null;
  if (checklistType.assignedUserId) {
    const [assignedUser] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, checklistType.assignedUserId))
      .limit(1);
    assignedUserName = assignedUser?.name ?? null;
  }

  const unmetPrerequisites = await getUnmetPrerequisites(checklistType.id, viewer.id, date);

  return {
    id: checklistType.id,
    name: checklistType.name,
    description: checklistType.description,
    type: checklistType.type,
    assignedUserName,
    prerequisitosPendentes: unmetPrerequisites.map((p) => p.name),
    items: items.map((item) => {
      const completion = completionByItem.get(item.id);
      return {
        id: item.id,
        label: item.label,
        requiresPhoto: item.requiresPhoto,
        requiresShiftLog: item.requiresShiftLog,
        requiresRequisicao: item.requiresRequisicao,
        requiresContagem: item.requiresContagem,
        status: (completion?.status ?? "pending") as CompletionStatus,
        justification: completion?.justification ?? null,
        photoUrl: completion?.photoUrl ?? null,
        completedAt: completion?.completedAt ?? null,
      };
    }),
  };
}

/**
 * unitId disambiguates which of a user's completions to show for a given
 * checklist/date, now that the same person can hold separate completion
 * state for their own unit and a unit they covered that day (see
 * pickByEffectiveUnit). Pass the effective unit that combo belongs to —
 * getChecklistHistorySummary's unitId is exactly that.
 */
export async function getChecklistExportData(
  checklistTypeId: number,
  userId: number,
  date: string,
  unitId: number | null,
  organizationId: number,
) {
  const [checklistType] = await db
    .select()
    .from(checklistTypes)
    .where(and(eq(checklistTypes.id, checklistTypeId), eq(checklistTypes.organizationId, organizationId)))
    .limit(1);

  if (!checklistType) return null;

  const [requester] = await db
    .select({ name: users.name, homeUnitId: users.unitId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!requester) return null;

  const [unit] = unitId
    ? await db.select({ name: units.name }).from(units).where(eq(units.id, unitId)).limit(1)
    : [null];

  const items = tarefasDoColaborador(
    await db
      .select()
      .from(checklistTypeItems)
      .where(eq(checklistTypeItems.checklistTypeId, checklistTypeId))
      .orderBy(asc(checklistTypeItems.position)),
    userId,
    (await tarefasEscondidasDe([userId])).get(userId),
  );

  const itemIds = items.map((i) => i.id);
  const completions =
    itemIds.length > 0
      ? await db
          .select()
          .from(checklistCompletions)
          .where(
            and(
              inArray(checklistCompletions.itemId, itemIds),
              eq(checklistCompletions.userId, userId),
              eq(checklistCompletions.date, date),
            ),
          )
      : [];

  const completionByItem = pickByEffectiveUnit(completions, requester.homeUnitId, unitId);

  return {
    checklistType,
    userName: requester.name,
    unitName: unit?.name ?? null,
    date,
    items: items.map((item) => {
      const completion = completionByItem.get(item.id);
      return {
        label: item.label,
        requiresPhoto: item.requiresPhoto,
        status: (completion?.status ?? "pending") as CompletionStatus,
        justification: completion?.justification ?? null,
        photoUrl: completion?.photoUrl ?? null,
        completedAt: completion?.completedAt ?? null,
      };
    }),
  };
}

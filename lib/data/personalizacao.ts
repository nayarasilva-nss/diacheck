import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { checklistItemHidden, checklistTypeUsers } from "@/lib/db/schema";

// Personalização de um modelo por colaborador: o modelo base vale para a
// função; um colaborador pode receber o modelo mesmo fora da função
// (checklist_type_users), esconder tarefas do base (checklist_item_hidden)
// e ter tarefas extras só dele (checklist_type_items.owner_user_id).

/** Modelos que o colaborador recebe além da função dele. */
export async function modelosExtrasDe(userIds: number[]) {
  if (userIds.length === 0) return new Map<number, Set<number>>();
  const rows = await db
    .select({ typeId: checklistTypeUsers.checklistTypeId, userId: checklistTypeUsers.userId })
    .from(checklistTypeUsers)
    .where(inArray(checklistTypeUsers.userId, userIds));
  const map = new Map<number, Set<number>>();
  for (const r of rows) map.set(r.userId, (map.get(r.userId) ?? new Set()).add(r.typeId));
  return map;
}

/** Tarefas do modelo base que cada colaborador não recebe. */
export async function tarefasEscondidasDe(userIds: number[]) {
  if (userIds.length === 0) return new Map<number, Set<number>>();
  const rows = await db
    .select({ itemId: checklistItemHidden.itemId, userId: checklistItemHidden.userId })
    .from(checklistItemHidden)
    .where(inArray(checklistItemHidden.userId, userIds));
  const map = new Map<number, Set<number>>();
  for (const r of rows) map.set(r.userId, (map.get(r.userId) ?? new Set()).add(r.itemId));
  return map;
}

/** Só as tarefas que este colaborador recebe: as do base (menos as
 * escondidas) e as extras que são dele. */
export function tarefasDoColaborador<T extends { id: number; ownerUserId: number | null }>(
  items: T[],
  userId: number,
  escondidas: Set<number> | undefined,
) {
  return items.filter(
    (i) => (i.ownerUserId === null ? !escondidas?.has(i.id) : i.ownerUserId === userId),
  );
}



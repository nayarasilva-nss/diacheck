import "server-only";
import { asc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import {
  users,
  checklistTypes,
  checklistTypeItems,
  checklistTypePrerequisites,
  units,
  jobFunctions,
} from "@/lib/db/schema";

const assignedUsers = alias(users, "assigned_users");

export { getUnits, getJobFunctions } from "./units";

export async function getUsers(organizationId: number) {
  return db
    .select({
      id: users.id,
      name: users.name,
      username: users.username,
      profile: users.profile,
      unitId: users.unitId,
      unitName: units.name,
      jobFunctionId: users.jobFunctionId,
      jobFunctionName: jobFunctions.name,
      folgaDias: users.folgaDias,
      requisicaoUnidadesExtras: users.requisicaoUnidadesExtras,
      checklistObrigatorio: users.checklistObrigatorio,
    })
    .from(users)
    .leftJoin(units, eq(units.id, users.unitId))
    .leftJoin(jobFunctions, eq(jobFunctions.id, users.jobFunctionId))
    .where(eq(users.organizationId, organizationId))
    .orderBy(asc(users.id));
}

export async function getChecklistTypesWithCounts(organizationId: number) {
  const types = await db
    .select({
      id: checklistTypes.id,
      name: checklistTypes.name,
      description: checklistTypes.description,
      deadlineTime: checklistTypes.deadlineTime,
      type: checklistTypes.type,
      jobFunctionId: checklistTypes.jobFunctionId,
      jobFunctionName: jobFunctions.name,
      assignedUserId: checklistTypes.assignedUserId,
      assignedUserName: assignedUsers.name,
    })
    .from(checklistTypes)
    .leftJoin(jobFunctions, eq(jobFunctions.id, checklistTypes.jobFunctionId))
    .leftJoin(assignedUsers, eq(assignedUsers.id, checklistTypes.assignedUserId))
    .where(eq(checklistTypes.organizationId, organizationId))
    .orderBy(asc(checklistTypes.id));
  const items = await db
    .select()
    .from(checklistTypeItems)
    .orderBy(asc(checklistTypeItems.position));

  const itemsByType = new Map<
    number,
    { label: string; requiresPhoto: boolean }[]
  >();
  for (const item of items) {
    const list = itemsByType.get(item.checklistTypeId) ?? [];
    list.push({ label: item.label, requiresPhoto: item.requiresPhoto });
    itemsByType.set(item.checklistTypeId, list);
  }

  const prereqRows = await db
    .select({
      checklistTypeId: checklistTypePrerequisites.checklistTypeId,
      requiresChecklistTypeId: checklistTypePrerequisites.requiresChecklistTypeId,
    })
    .from(checklistTypePrerequisites)
    // Só os pré-requisitos dos modelos desta empresa (os ids vêm do types,
    // que já vem filtrado por organizationId acima).
    .where(inArray(checklistTypePrerequisites.checklistTypeId, types.length ? types.map((t) => t.id) : [-1]));
  const prereqsByType = new Map<number, number[]>();
  for (const row of prereqRows) {
    const list = prereqsByType.get(row.checklistTypeId) ?? [];
    list.push(row.requiresChecklistTypeId);
    prereqsByType.set(row.checklistTypeId, list);
  }

  return types.map((t) => {
    const typeItems = itemsByType.get(t.id) ?? [];
    return {
      ...t,
      items: typeItems,
      itemCount: typeItems.length,
      prerequisiteIds: prereqsByType.get(t.id) ?? [],
    };
  });
}

"use server";

import { and, asc, eq, inArray, ne } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { requireGestor } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import {
  users,
  checklistTypes,
  checklistTypeItems,
  checklistTypePrerequisites,
  units,
  jobFunctions,
} from "@/lib/db/schema";

export type ActionState = { error?: string } | undefined;

function revalidateManageViews() {
  revalidatePath("/gerenciar");
  revalidatePath("/checklist");
  revalidatePath("/hoje");
  revalidatePath("/relatorio");
  revalidatePath("/historico");
}

function parseDeadline(formData: FormData): string | null {
  const raw = String(formData.get("deadlineTime") ?? "").trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(raw) ? raw : null;
}

function parseOptionalId(formData: FormData, key: string): number | null {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

const PROFILES = ["gestor", "gerente", "lider", "rh"] as const;

export async function createUser(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const gestor = await requireGestor();

  const name = String(formData.get("name") ?? "").trim();
  const username = String(formData.get("username") ?? "")
    .trim()
    .toLowerCase();
  const profile = String(formData.get("profile") ?? "");
  const password = String(formData.get("password") ?? "");
  const unitId = parseOptionalId(formData, "unitId");
  const jobFunctionId = parseOptionalId(formData, "jobFunctionId");

  if (
    !name ||
    !username ||
    !password ||
    !PROFILES.includes(profile as (typeof PROFILES)[number])
  ) {
    return { error: "Preencha todos os campos" };
  }

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  if (existing.length > 0) {
    return { error: "Já existe um usuário com esse login" };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await db.insert(users).values({
    // Novo usuário sempre entra na mesma empresa de quem criou — não dá
    // pra um gestor criar usuário em outra empresa por aqui.
    organizationId: gestor.organizationId,
    name,
    username,
    passwordHash,
    profile: profile as (typeof PROFILES)[number],
    unitId,
    jobFunctionId,
  });

  revalidateManageViews();
}

export async function updateUser(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const gestor = await requireGestor();
  if (!gestor.organizationId) return { error: "Conta sem empresa associada" };

  const id = Number(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  const username = String(formData.get("username") ?? "")
    .trim()
    .toLowerCase();
  const profile = String(formData.get("profile") ?? "");
  const password = String(formData.get("password") ?? "");
  const unitId = parseOptionalId(formData, "unitId");
  const jobFunctionId = parseOptionalId(formData, "jobFunctionId");
  // a marca vem como "semChecklist" quando marcada; desmarcada não vem no formulário
  const checklistObrigatorio = formData.get("semChecklist") === null;
  const pedidoExtras = [...new Set(formData.getAll("reqUnidades").map(Number))].filter((n) => Number.isInteger(n) && n > 0);
  const folgaDias = [...new Set(formData.getAll("folgaDias").map(Number))]
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    .sort();

  if (
    !id ||
    !name ||
    !username ||
    !PROFILES.includes(profile as (typeof PROFILES)[number])
  ) {
    return { error: "Preencha o nome e o usuário" };
  }

  const [target] = await db
    .select({ profile: users.profile })
    .from(users)
    .where(and(eq(users.id, id), eq(users.organizationId, gestor.organizationId)))
    .limit(1);
  if (!target) return { error: "Usuário não encontrado" };
  if (target.profile === "master") {
    return { error: "Não é possível editar esse usuário por aqui" };
  }

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.username, username), ne(users.id, id)))
    .limit(1);
  if (existing.length > 0) {
    return { error: "Já existe um usuário com esse login" };
  }

  // só unidades da própria empresa, e nunca a unidade principal da pessoa
  const unidadesDaEmpresa = pedidoExtras.length
    ? await db.select({ id: units.id }).from(units).where(and(eq(units.organizationId, gestor.organizationId), inArray(units.id, pedidoExtras)))
    : [];
  const requisicaoUnidadesExtras = unidadesDaEmpresa.map((u) => u.id).filter((uid) => uid !== unitId);

  const passwordHash = password ? await bcrypt.hash(password, 10) : undefined;

  await db
    .update(users)
    .set({
      name,
      username,
      profile: profile as (typeof PROFILES)[number],
      unitId,
      jobFunctionId,
      folgaDias,
      requisicaoUnidadesExtras,
      checklistObrigatorio,
      ...(passwordHash ? { passwordHash } : {}),
    })
    .where(and(eq(users.id, id), eq(users.organizationId, gestor.organizationId)));

  revalidateManageViews();
}

export async function deleteUser(formData: FormData) {
  const gestor = await requireGestor();
  const id = Number(formData.get("id"));
  if (!id || !gestor.organizationId) return;

  const [target] = await db
    .select({ profile: users.profile })
    .from(users)
    .where(and(eq(users.id, id), eq(users.organizationId, gestor.organizationId)))
    .limit(1);
  if (!target || target.profile === "master") return;

  await db.delete(users).where(and(eq(users.id, id), eq(users.organizationId, gestor.organizationId)));
  revalidateManageViews();
}

export async function createUnit(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const gestor = await requireGestor();
  if (!gestor.organizationId) return { error: "Conta sem empresa associada" };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    return { error: "Preencha o nome da unidade" };
  }

  const existing = await db
    .select({ id: units.id })
    .from(units)
    .where(and(eq(units.name, name), eq(units.organizationId, gestor.organizationId)))
    .limit(1);
  if (existing.length > 0) {
    return { error: "Já existe uma unidade com esse nome" };
  }

  await db.insert(units).values({ name, organizationId: gestor.organizationId });
  revalidateManageViews();
}

export async function deleteUnit(formData: FormData) {
  const gestor = await requireGestor();
  const id = Number(formData.get("id"));
  if (!id || !gestor.organizationId) return;
  await db.delete(units).where(and(eq(units.id, id), eq(units.organizationId, gestor.organizationId)));
  revalidateManageViews();
}

export async function createJobFunction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const gestor = await requireGestor();
  if (!gestor.organizationId) return { error: "Conta sem empresa associada" };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    return { error: "Preencha o nome da função" };
  }

  const existing = await db
    .select({ id: jobFunctions.id })
    .from(jobFunctions)
    .where(and(eq(jobFunctions.name, name), eq(jobFunctions.organizationId, gestor.organizationId)))
    .limit(1);
  if (existing.length > 0) {
    return { error: "Já existe uma função com esse nome" };
  }

  await db.insert(jobFunctions).values({ name, organizationId: gestor.organizationId });
  revalidateManageViews();
}

export async function updateJobFunction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const gestor = await requireGestor();
  if (!gestor.organizationId) return { error: "Conta sem empresa associada" };

  const id = Number(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) {
    return { error: "Preencha o nome da função" };
  }

  const existing = await db
    .select({ id: jobFunctions.id })
    .from(jobFunctions)
    .where(
      and(
        eq(jobFunctions.name, name),
        eq(jobFunctions.organizationId, gestor.organizationId),
        ne(jobFunctions.id, id),
      ),
    )
    .limit(1);
  if (existing.length > 0) {
    return { error: "Já existe uma função com esse nome" };
  }

  await db
    .update(jobFunctions)
    .set({ name })
    .where(and(eq(jobFunctions.id, id), eq(jobFunctions.organizationId, gestor.organizationId)));
  revalidateManageViews();
}

export async function deleteJobFunction(formData: FormData) {
  const gestor = await requireGestor();
  const id = Number(formData.get("id"));
  if (!id || !gestor.organizationId) return;
  await db
    .delete(jobFunctions)
    .where(and(eq(jobFunctions.id, id), eq(jobFunctions.organizationId, gestor.organizationId)));
  revalidateManageViews();
}

type ParsedItem = { label: string; requiresPhoto: boolean };

function parseItems(formData: FormData): ParsedItem[] {
  const raw = String(formData.get("itemsJson") ?? "[]");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((entry) => ({
      label: typeof entry?.label === "string" ? entry.label.trim() : "",
      requiresPhoto: Boolean(entry?.requiresPhoto),
    }))
    .filter((item) => item.label.length > 0);
}

function parsePrerequisiteIds(formData: FormData): number[] {
  return formData
    .getAll("prerequisiteIds")
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0);
}

export async function createChecklistType(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const gestor = await requireGestor();
  if (!gestor.organizationId) return { error: "Conta sem empresa associada" };

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const type = String(formData.get("type") ?? "");
  const jobFunctionId = parseOptionalId(formData, "jobFunctionId");
  const assignedUserId = parseOptionalId(formData, "assignedUserId");
  const items = parseItems(formData);
  const prerequisiteIds = parsePrerequisiteIds(formData);

  if (!name || (type !== "daily" && type !== "weekly") || items.length === 0) {
    return { error: "Preencha o nome, o tipo e as tarefas" };
  }

  const [checklistType] = await db
    .insert(checklistTypes)
    .values({ organizationId: gestor.organizationId, name, description, deadlineTime: parseDeadline(formData), type, jobFunctionId, assignedUserId })
    .returning({ id: checklistTypes.id });

  await db.insert(checklistTypeItems).values(
    items.map((item, position) => ({
      checklistTypeId: checklistType.id,
      label: item.label,
      requiresPhoto: item.requiresPhoto,
      position,
    })),
  );

  if (prerequisiteIds.length > 0) {
    await db.insert(checklistTypePrerequisites).values(
      prerequisiteIds.map((requiresChecklistTypeId) => ({
        checklistTypeId: checklistType.id,
        requiresChecklistTypeId,
      })),
    );
  }

  revalidateManageViews();
}

export async function updateChecklistType(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const gestor = await requireGestor();
  if (!gestor.organizationId) return { error: "Conta sem empresa associada" };

  const id = Number(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const type = String(formData.get("type") ?? "");
  const jobFunctionId = parseOptionalId(formData, "jobFunctionId");
  const assignedUserId = parseOptionalId(formData, "assignedUserId");
  const items = parseItems(formData);
  const prerequisiteIds = parsePrerequisiteIds(formData).filter((pid) => pid !== id);

  if (
    !id ||
    !name ||
    (type !== "daily" && type !== "weekly") ||
    items.length === 0
  ) {
    return { error: "Preencha o nome, o tipo e as tarefas" };
  }

  await db
    .update(checklistTypes)
    .set({ name, description, deadlineTime: parseDeadline(formData), type, jobFunctionId, assignedUserId })
    .where(and(eq(checklistTypes.id, id), eq(checklistTypes.organizationId, gestor.organizationId)));

  await db
    .delete(checklistTypePrerequisites)
    .where(eq(checklistTypePrerequisites.checklistTypeId, id));
  if (prerequisiteIds.length > 0) {
    await db.insert(checklistTypePrerequisites).values(
      prerequisiteIds.map((requiresChecklistTypeId) => ({
        checklistTypeId: id,
        requiresChecklistTypeId,
      })),
    );
  }

  // Reconcile by position instead of replacing wholesale, so unchanged
  // tasks keep their id and don't lose their conformidade history.
  const existingItems = await db
    .select()
    .from(checklistTypeItems)
    .where(eq(checklistTypeItems.checklistTypeId, id))
    .orderBy(asc(checklistTypeItems.position));

  for (let position = 0; position < items.length; position++) {
    const item = items[position];
    const existing = existingItems[position];
    if (existing) {
      if (
        existing.label !== item.label ||
        existing.requiresPhoto !== item.requiresPhoto
      ) {
        await db
          .update(checklistTypeItems)
          .set({ label: item.label, requiresPhoto: item.requiresPhoto })
          .where(eq(checklistTypeItems.id, existing.id));
      }
    } else {
      await db.insert(checklistTypeItems).values({
        checklistTypeId: id,
        label: item.label,
        requiresPhoto: item.requiresPhoto,
        position,
      });
    }
  }

  if (existingItems.length > items.length) {
    const removedIds = existingItems.slice(items.length).map((i) => i.id);
    await db
      .delete(checklistTypeItems)
      .where(inArray(checklistTypeItems.id, removedIds));
  }

  revalidateManageViews();
}

export async function deleteChecklistType(formData: FormData) {
  const gestor = await requireGestor();
  const id = Number(formData.get("id"));
  if (!id || !gestor.organizationId) return;
  await db
    .delete(checklistTypes)
    .where(and(eq(checklistTypes.id, id), eq(checklistTypes.organizationId, gestor.organizationId)));
  revalidateManageViews();
}

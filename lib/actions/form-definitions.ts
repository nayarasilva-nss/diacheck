"use server";

import { isGestorProfile } from "@/lib/auth/profile";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/dal";
import { resolveEffectiveUnitId } from "@/lib/auth/covering-unit";
import { canSubmitFormDefinition } from "@/lib/auth/form-definitions";
import { db } from "@/lib/db";
import { formDefinitions, formSubmissions } from "@/lib/db/schema";
import {
  getFormDefinition,
  isValidFieldType,
  slugifyFieldKey,
  type FormField,
} from "@/lib/data/form-definitions";

export type ActionState = { error?: string } | undefined;

function revalidateFormViews() {
  revalidatePath("/formularios");
  revalidatePath("/gerenciar");
}

function parseFields(formData: FormData): FormField[] | null {
  const raw = String(formData.get("fieldsJson") ?? "[]");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;

  const seenKeys = new Set<string>();
  const fields: FormField[] = [];
  for (const entry of parsed) {
    const label = typeof entry?.label === "string" ? entry.label.trim() : "";
    const type = entry?.type;
    if (!label || !isValidFieldType(type)) continue;

    const field: FormField = {
      key: slugifyFieldKey(label, seenKeys),
      label,
      type,
      required: Boolean(entry?.required),
    };
    if (type === "number") {
      const decimals = Number(entry?.decimals);
      field.decimals = Number.isInteger(decimals) && decimals >= 0 && decimals <= 4 ? decimals : 0;
      const unit = typeof entry?.unit === "string" ? entry.unit.trim() : "";
      if (unit) field.unit = unit;
    }
    if (type === "select") {
      const options = Array.isArray(entry?.options)
        ? entry.options.map((o: unknown) => String(o).trim()).filter(Boolean)
        : [];
      field.options = options;
    }
    fields.push(field);
  }
  return fields;
}

export async function createFormDefinition(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!isGestorProfile(user.profile)) {
    return { error: "Só o gestor pode criar um formulário personalizado" };
  }
  if (!user.organizationId) {
    return { error: "Seu usuário não está vinculado a uma empresa" };
  }

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const fields = parseFields(formData);
  const allowedJobFunctionNames = formData
    .getAll("allowedJobFunctionNames")
    .map((v) => String(v));
  const allowGestor = formData.get("allowGestor") === "on";

  if (!name) return { error: "Informe o nome do formulário" };
  if (!fields || fields.length === 0) return { error: "Adicione ao menos um campo" };

  await db.insert(formDefinitions).values({
    organizationId: user.organizationId,
    name,
    description,
    fields,
    allowedJobFunctionNames,
    allowGestor,
  });

  revalidateFormViews();
}

export async function updateFormDefinition(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!isGestorProfile(user.profile) || !user.organizationId) {
    return { error: "Só o gestor pode editar um formulário personalizado" };
  }

  const id = Number(formData.get("id"));
  const existing = id ? await getFormDefinition(id, user.organizationId) : null;
  if (!existing) return { error: "Formulário não encontrado" };

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const fields = parseFields(formData);
  const allowedJobFunctionNames = formData
    .getAll("allowedJobFunctionNames")
    .map((v) => String(v));
  const allowGestor = formData.get("allowGestor") === "on";
  const active = formData.get("active") === "on";

  if (!name) return { error: "Informe o nome do formulário" };
  if (!fields || fields.length === 0) return { error: "Adicione ao menos um campo" };

  await db
    .update(formDefinitions)
    .set({ name, description, fields, allowedJobFunctionNames, allowGestor, active })
    .where(eq(formDefinitions.id, id));

  revalidateFormViews();
}

export async function duplicateFormDefinition(formData: FormData) {
  const user = await getCurrentUser();
  if (!isGestorProfile(user.profile) || !user.organizationId) return;
  const id = Number(formData.get("id"));
  if (!id) return;
  const origem = await getFormDefinition(id, user.organizationId);
  if (!origem) return;
  // A cópia nasce inativa: dá para ajustar antes de aparecer para a equipe.
  await db.insert(formDefinitions).values({
    organizationId: user.organizationId,
    name: `${origem.name} (cópia)`,
    description: origem.description,
    fields: origem.fields,
    allowedJobFunctionNames: origem.allowedJobFunctionNames,
    allowGestor: origem.allowGestor,
    active: false,
  });
  revalidateFormViews();
}

export async function deleteFormDefinition(formData: FormData) {
  const user = await getCurrentUser();
  if (!isGestorProfile(user.profile) || !user.organizationId) return;
  const id = Number(formData.get("id"));
  if (!id) return;
  await db
    .delete(formDefinitions)
    .where(and(eq(formDefinitions.id, id), eq(formDefinitions.organizationId, user.organizationId)));
  revalidateFormViews();
}

export async function createFormSubmission(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user.organizationId) return { error: "Seu usuário não está vinculado a uma empresa" };

  const formDefinitionId = Number(formData.get("formDefinitionId"));
  const def = formDefinitionId ? await getFormDefinition(formDefinitionId, user.organizationId) : null;
  if (!def || !def.active) return { error: "Formulário não encontrado" };
  if (!canSubmitFormDefinition(user, def)) {
    return { error: "Você não tem permissão para preencher esse formulário" };
  }

  // Unidade efetiva do dia — mesmo padrão dos outros módulos: quem está
  // cobrindo registra pra lá; quem não tem unidade fixa (Gestor) escolhe
  // na hora.
  let effectiveUnitId = await resolveEffectiveUnitId(user);
  if (!effectiveUnitId) {
    const rawUnitId = Number(formData.get("unitId"));
    if (!rawUnitId) return { error: "Selecione a unidade" };
    effectiveUnitId = rawUnitId;
  }

  const date = String(formData.get("date") ?? "").trim();
  if (!date) return { error: "Informe a data" };

  const values: Record<string, string | number | boolean> = {};
  for (const field of def.fields) {
    const raw = formData.get(`field_${field.key}`);
    if (field.type === "boolean") {
      values[field.key] = raw === "on";
      continue;
    }
    const strVal = String(raw ?? "").trim();
    if (!strVal) {
      if (field.required) return { error: `Preencha o campo "${field.label}"` };
      continue;
    }
    if (field.type === "number") {
      const num = Number(strVal.replace(",", "."));
      if (!Number.isFinite(num)) return { error: `Valor inválido em "${field.label}"` };
      values[field.key] = num;
    } else if (field.type === "select") {
      if (field.options && !field.options.includes(strVal)) {
        return { error: `Valor inválido em "${field.label}"` };
      }
      values[field.key] = strVal;
    } else {
      values[field.key] = strVal;
    }
  }

  await db.insert(formSubmissions).values({
    formDefinitionId: def.id,
    organizationId: user.organizationId,
    unitId: effectiveUnitId,
    userId: user.id,
    date,
    values,
  });

  revalidateFormViews();
}

export async function deleteFormSubmission(formData: FormData) {
  const user = await getCurrentUser();
  if (!isGestorProfile(user.profile) || !user.organizationId) return;
  const id = Number(formData.get("id"));
  if (!id) return;
  await db
    .delete(formSubmissions)
    .where(and(eq(formSubmissions.id, id), eq(formSubmissions.organizationId, user.organizationId)));
  revalidateFormViews();
}

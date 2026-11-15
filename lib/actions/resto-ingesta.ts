"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getCurrentUser, requireGestor } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { restoIngestaRecords } from "@/lib/db/schema";
import { canSubmitRestoIngesta } from "@/lib/data/resto-ingesta";
import { addHistoryEntry } from "@/lib/data/history";
import { resolveEffectiveUnitId } from "@/lib/auth/covering-unit";
import { enviarRestoAoErp, excluirRestoNoErp } from "@/lib/erp/ocorrencias";
import { ligacaoDaEmpresa } from "@/lib/erp/integracao";

export type RestoIngestaFormState = { error?: string } | undefined;

export async function createRestoIngestaRecord(
  _prevState: RestoIngestaFormState,
  formData: FormData,
): Promise<RestoIngestaFormState> {
  const user = await getCurrentUser();

  if (!canSubmitRestoIngesta(user)) {
    return {
      error: "Você não tem permissão para registrar dados de resto ingesta",
    };
  }

  // Unidade efetiva do dia — quem está cobrindo outra unidade registra
  // pra lá. Quem não tem unidade fixa (hoje, Gestor) escolhe na hora,
  // via unitId no formulário (ver units em RestoIngestaForm).
  let effectiveUnitId = await resolveEffectiveUnitId(user);
  if (!effectiveUnitId) {
    const rawUnitId = Number(formData.get("unitId"));
    if (!rawUnitId) {
      return { error: "Selecione a unidade" };
    }
    effectiveUnitId = rawUnitId;
  }

  const date = String(formData.get("date") ?? "").trim();
  const experienciasRaw = String(
    formData.get("experienciasVendidas") ?? "",
  ).trim();
  const desperdicioRaw = String(formData.get("desperdicioKg") ?? "")
    .trim()
    .replace(",", ".");

  if (!date) return { error: "Informe a data" };

  const experienciasVendidas = Number(experienciasRaw);
  if (!Number.isInteger(experienciasVendidas) || experienciasVendidas < 0) {
    return { error: "Informe uma quantidade de experiências válida" };
  }

  const desperdicioKg = Number(desperdicioRaw);
  if (Number.isNaN(desperdicioKg) || desperdicioKg < 0) {
    return { error: "Informe um peso de desperdício válido" };
  }

  if (!user.organizationId) return { error: "Conta sem empresa associada" };

  const [novo] = await db.insert(restoIngestaRecords).values({
    organizationId: user.organizationId,
    unitId: effectiveUnitId,
    userId: user.id,
    date,
    experienciasVendidas,
    desperdicioKg: desperdicioKg.toFixed(3),
  }).returning({ id: restoIngestaRecords.id });
  // vai para o acompanhamento da semana do ERP
  if (novo) after(() => enviarRestoAoErp(novo.id));

  await addHistoryEntry(
    user.id,
    `Registro de resto ingesta: ${experienciasVendidas} experiências, ${desperdicioKg.toFixed(3)} kg de desperdício`,
    "completed",
  );

  revalidatePath("/perdas");
}

export async function deleteRestoIngestaRecord(formData: FormData) {
  const gestor = await requireGestor();
  const id = Number(formData.get("id"));
  if (!id || !gestor.organizationId) return;
  await db
    .delete(restoIngestaRecords)
    .where(and(eq(restoIngestaRecords.id, id), eq(restoIngestaRecords.organizationId, gestor.organizationId)));
  after(async () => excluirRestoNoErp(id, await ligacaoDaEmpresa(gestor.organizationId)));
  revalidatePath("/perdas");
}

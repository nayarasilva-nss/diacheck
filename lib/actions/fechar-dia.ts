"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { fechamentosDia } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { getResumoDoDia, resumoParaGuardar } from "@/lib/data/resumo-dia";

export async function fecharDia(formData: FormData) {
  const user = await getCurrentUser();
  if (!user.organizationId) return;
  const nota = String(formData.get("nota") ?? "").trim().slice(0, 1000) || null;
  const resumo = await getResumoDoDia(user);
  const guardado = resumoParaGuardar(resumo);
  await db
    .insert(fechamentosDia)
    .values({ organizationId: user.organizationId, userId: user.id, date: resumo.hoje, nota, resumo: guardado })
    .onConflictDoUpdate({ target: [fechamentosDia.userId, fechamentosDia.date], set: { nota, resumo: guardado, createdAt: new Date() } });
  revalidatePath("/resumo-do-dia");
}

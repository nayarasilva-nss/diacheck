"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { rotinaItens, rotinaMarcas, rotinasPessoais } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { checklistDayISO } from "@/lib/date-utils";

export type RotinaState = { error?: string; ok?: boolean } | undefined;

function ler(formData: FormData) {
  const nome = String(formData.get("nome") ?? "").trim().slice(0, 120);
  const dias = formData.getAll("dias").map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  const hora = String(formData.get("lembreteHora") ?? "").trim();
  const lembreteHora = /^([01]\d|2[0-3]):[0-5]\d$/.test(hora) ? hora : null;
  const itens = String(formData.get("itens") ?? "")
    .split("\n")
    .map((l) => l.trim().slice(0, 200))
    .filter(Boolean)
    .slice(0, 40);
  return { nome, dias: [...new Set(dias)].sort(), lembreteHora, itens };
}

export async function criarRotina(_prev: RotinaState, formData: FormData): Promise<RotinaState> {
  const user = await getCurrentUser();
  if (!user.organizationId) return { error: "Conta sem empresa associada" };
  const r = ler(formData);
  if (!r.nome) return { error: "Dê um nome para a rotina" };
  if (r.itens.length === 0) return { error: "Escreva ao menos um item (um por linha)" };
  const [nova] = await db.insert(rotinasPessoais).values({ organizationId: user.organizationId, userId: user.id, nome: r.nome, dias: r.dias, lembreteHora: r.lembreteHora }).returning({ id: rotinasPessoais.id });
  await db.insert(rotinaItens).values(r.itens.map((texto, i) => ({ rotinaId: nova.id, texto, posicao: i })));
  revalidatePath("/rotinas");
  revalidatePath("/hoje");
  return { ok: true };
}

export async function atualizarRotina(_prev: RotinaState, formData: FormData): Promise<RotinaState> {
  const user = await getCurrentUser();
  const id = Number(formData.get("id"));
  const r = ler(formData);
  if (!r.nome) return { error: "Dê um nome para a rotina" };
  if (r.itens.length === 0) return { error: "Escreva ao menos um item (um por linha)" };
  const [dona] = await db.select({ id: rotinasPessoais.id }).from(rotinasPessoais).where(and(eq(rotinasPessoais.id, id), eq(rotinasPessoais.userId, user.id))).limit(1);
  if (!dona) return { error: "Rotina não encontrada" };
  await db.update(rotinasPessoais).set({ nome: r.nome, dias: r.dias, lembreteHora: r.lembreteHora }).where(eq(rotinasPessoais.id, id));
  // mantém as marcas dos itens que seguem iguais: atualiza por posição, apaga/cria o resto
  const atuais = await db.select().from(rotinaItens).where(eq(rotinaItens.rotinaId, id)).orderBy(rotinaItens.posicao, rotinaItens.id);
  for (let i = 0; i < r.itens.length; i++) {
    if (atuais[i]) await db.update(rotinaItens).set({ texto: r.itens[i], posicao: i }).where(eq(rotinaItens.id, atuais[i].id));
    else await db.insert(rotinaItens).values({ rotinaId: id, texto: r.itens[i], posicao: i });
  }
  for (const sobra of atuais.slice(r.itens.length)) await db.delete(rotinaItens).where(eq(rotinaItens.id, sobra.id));
  revalidatePath("/rotinas");
  revalidatePath("/hoje");
  return { ok: true };
}

export async function excluirRotina(formData: FormData) {
  const user = await getCurrentUser();
  await db.delete(rotinasPessoais).where(and(eq(rotinasPessoais.id, Number(formData.get("id"))), eq(rotinasPessoais.userId, user.id)));
  revalidatePath("/rotinas");
  revalidatePath("/hoje");
}

/** Marca ou desmarca um item de hoje. */
export async function alternarItemRotina(itemId: number, feito: boolean) {
  const user = await getCurrentUser();
  const [item] = await db
    .select({ id: rotinaItens.id })
    .from(rotinaItens)
    .innerJoin(rotinasPessoais, eq(rotinasPessoais.id, rotinaItens.rotinaId))
    .where(and(eq(rotinaItens.id, itemId), eq(rotinasPessoais.userId, user.id)))
    .limit(1);
  if (!item) return { ok: false };
  const hoje = checklistDayISO();
  if (feito) await db.insert(rotinaMarcas).values({ itemId, date: hoje }).onConflictDoNothing();
  else await db.delete(rotinaMarcas).where(and(eq(rotinaMarcas.itemId, itemId), eq(rotinaMarcas.date, hoje)));
  revalidatePath("/rotinas");
  revalidatePath("/hoje");
  return { ok: true };
}

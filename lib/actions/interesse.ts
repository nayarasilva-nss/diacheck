"use server";

import { eq, gte, sql } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/lib/db";
import { interesses, users } from "@/lib/db/schema";
import { enviarPush } from "@/lib/push";

export type InteresseState = { error?: string; ok?: boolean } | undefined;

/** Pedido de contato vindo da página de venda (sem login). */
export async function enviarInteresse(_prev: InteresseState, formData: FormData): Promise<InteresseState> {
  // campo-armadilha: robôs preenchem, pessoas não veem
  if (String(formData.get("site") ?? "").trim()) return { ok: true };

  const nome = String(formData.get("nome") ?? "").trim().slice(0, 120);
  const empresa = String(formData.get("empresa") ?? "").trim().slice(0, 120) || null;
  const contato = String(formData.get("contato") ?? "").trim().slice(0, 160);
  const mensagem = String(formData.get("mensagem") ?? "").trim().slice(0, 1000) || null;
  if (!nome) return { error: "Diga seu nome" };
  if (!contato || contato.length < 6) return { error: "Informe um e-mail ou WhatsApp para a gente responder" };

  // freio simples: no máximo 30 pedidos por hora no total
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(interesses).where(gte(interesses.createdAt, new Date(Date.now() - 60 * 60 * 1000)));
  if (n >= 30) return { error: "Muitos pedidos agora. Tente de novo mais tarde ou escreva para contato@diacheck.app.br" };

  await db.insert(interesses).values({ nome, empresa, contato, mensagem });

  after(async () => {
    const operadores = await db.select({ id: users.id }).from(users).where(eq(users.profile, "master"));
    await enviarPush(operadores.map((o) => o.id), { titulo: "Novo interesse no DiaCheck", corpo: `${nome}${empresa ? ` (${empresa})` : ""}`, url: "/plataforma", tag: "interesse" });
  });
  return { ok: true };
}

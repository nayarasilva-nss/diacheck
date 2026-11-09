"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { pushInscricoes } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { enviarPush } from "@/lib/push";

type Inscricao = { endpoint: string; p256dh: string; auth: string; userAgent?: string };

export async function salvarInscricaoPush(i: Inscricao) {
  const user = await getCurrentUser();
  if (!user.organizationId || !i.endpoint || !i.p256dh || !i.auth) return { ok: false };
  await db
    .insert(pushInscricoes)
    .values({ organizationId: user.organizationId, userId: user.id, endpoint: i.endpoint, p256dh: i.p256dh, auth: i.auth, userAgent: i.userAgent?.slice(0, 250) ?? null })
    .onConflictDoUpdate({ target: pushInscricoes.endpoint, set: { userId: user.id, organizationId: user.organizationId, p256dh: i.p256dh, auth: i.auth } });
  return { ok: true };
}

export async function removerInscricaoPush(endpoint: string) {
  const user = await getCurrentUser();
  await db.delete(pushInscricoes).where(and(eq(pushInscricoes.endpoint, endpoint), eq(pushInscricoes.userId, user.id)));
  return { ok: true };
}

/** Manda um aviso de teste para os aparelhos da própria pessoa. */
export async function enviarAvisoDeTeste() {
  const user = await getCurrentUser();
  const aparelhos = await db.select({ id: pushInscricoes.id }).from(pushInscricoes).where(eq(pushInscricoes.userId, user.id));
  if (aparelhos.length === 0) return { aparelhos: 0, enviados: 0, configurado: Boolean(process.env.VAPID_PRIVATE_KEY) };
  const enviados = await enviarPush([user.id], { titulo: "DiaCheck", corpo: "Os avisos estão funcionando neste aparelho.", url: "/hoje", tag: "teste" });
  return { aparelhos: aparelhos.length, enviados, configurado: Boolean(process.env.VAPID_PRIVATE_KEY) };
}

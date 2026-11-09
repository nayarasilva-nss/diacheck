"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { pushInscricoes } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";

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

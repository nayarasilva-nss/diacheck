import "server-only";
import * as webpush from "web-push";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { pushEnvios, pushInscricoes, users } from "@/lib/db/schema";

export type AvisoPush = { titulo: string; corpo: string; url?: string; tag?: string };

let configurado = false;
function configurar() {
  if (configurado) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "https://diacheck.app.br", pub, priv);
  configurado = true;
  return true;
}

/** Envia um aviso a todos os aparelhos das pessoas. Nunca lança: aviso é
 * um extra, não pode derrubar a ação que o gerou. Inscrições mortas
 * (aparelho desinstalou) são apagadas. */
export async function enviarPush(userIds: number[], aviso: AvisoPush) {
  try {
    if (userIds.length === 0 || !configurar()) return 0;
    const subs = await db.select().from(pushInscricoes).where(inArray(pushInscricoes.userId, userIds));
    const payload = JSON.stringify({ titulo: aviso.titulo, corpo: aviso.corpo, url: aviso.url ?? "/hoje", tag: aviso.tag });
    let enviados = 0;
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 });
          enviados++;
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) await db.delete(pushInscricoes).where(eq(pushInscricoes.id, s.id));
        }
      }),
    );
    return enviados;
  } catch (e) {
    console.error("Falha ao enviar push:", e);
    return 0;
  }
}

/** Gestores da empresa (gestor e master): quem acompanha tudo. */
export async function idsDosGestores(organizationId: number, excetoUserId?: number) {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.organizationId, organizationId), inArray(users.profile, ["gestor", "master"])));
  return rows.map((r) => r.id).filter((id) => id !== excetoUserId);
}

/** Gerentes da unidade (quem confere/recebe requisições dela). */
export async function idsDosGerentesDaUnidade(unitId: number, excetoUserId?: number) {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(or(eq(users.unitId, unitId), sql`${unitId} = ANY(${users.requisicaoUnidadesExtras})`), eq(users.profile, "gerente")));
  return rows.map((r) => r.id).filter((id) => id !== excetoUserId);
}

/** Aviso automático uma vez só por pessoa e chave (ex.: "atraso:12:2026-11-09"). */
export async function enviarPushUmaVez(userId: number, chave: string, aviso: AvisoPush) {
  const inserido = await db.insert(pushEnvios).values({ userId, chave }).onConflictDoNothing().returning({ id: pushEnvios.id });
  if (inserido.length === 0) return false;
  await enviarPush([userId], aviso);
  return true;
}

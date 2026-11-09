import { db } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { getPendenciasDoDia } from "@/lib/data/painel";
import { enviarPushUmaVez } from "@/lib/push";

/**
 * Lembretes de checklist por push, chamados a cada ~10 minutos por um
 * agendador externo (GitHub Actions) com `Authorization: Bearer CRON_SECRET`.
 * Cada aviso sai uma vez só por pessoa, checklist e dia.
 */
const ANTES_DO_PRAZO = 30; // minutos
const ATRASO_MAXIMO = 120; // não avisa atraso de mais de 2 h (já passou da hora de lembrar)

export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || req.headers.get("authorization") !== `Bearer ${segredo}`) {
    return new Response("Não autorizado", { status: 401 });
  }

  let prazo = 0;
  let atraso = 0;
  const orgs = await db.select({ id: organizations.id }).from(organizations);
  for (const org of orgs) {
    for (const p of await getPendenciasDoDia(org.id)) {
      const hora = p.deadlineTime.slice(0, 5);
      const base = `${p.typeName}:${p.date}`.slice(0, 100);
      if (p.minutosParaPrazo > 0 && p.minutosParaPrazo <= ANTES_DO_PRAZO) {
        if (await enviarPushUmaVez(p.userId, `prazo:${base}`, { titulo: "Checklist perto do prazo", corpo: `${p.typeName} vence às ${hora}.`, url: "/hoje", tag: `prazo-${base}` })) prazo++;
      } else if (p.minutosParaPrazo <= 0 && -p.minutosParaPrazo <= ATRASO_MAXIMO) {
        if (await enviarPushUmaVez(p.userId, `atraso:${base}`, { titulo: "Checklist atrasado", corpo: `${p.typeName} era até às ${hora}.`, url: "/hoje", tag: `atraso-${base}` })) atraso++;
      }
    }
  }
  return Response.json({ ok: true, prazo, atraso });
}

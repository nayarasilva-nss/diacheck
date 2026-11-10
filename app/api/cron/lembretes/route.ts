import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { getPendenciasDoDia } from "@/lib/data/painel";
import { enviarPushUmaVez } from "@/lib/push";
import { fechamentosDia, pushInscricoes, rotinasPessoais, users } from "@/lib/db/schema";
import { getMinhasRotinas } from "@/lib/data/rotinas";
import { minutesIntoChecklistDay } from "@/lib/checklist-scoring";
import { checklistDayISO } from "@/lib/date-utils";

/**
 * Lembretes de checklist por push, chamados a cada ~10 minutos por um
 * agendador externo (GitHub Actions) com `Authorization: Bearer CRON_SECRET`.
 * Cada aviso sai uma vez só por pessoa, checklist e dia.
 */
const ANTES_DO_PRAZO = 30; // minutos
const HORA_FECHAR_DIA = 22 * 60 + 30; // 22:30 (Brasília)
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

  // Rotinas pessoais com lembrete: avisa na hora marcada (até 2 h depois), se ainda houver item por fazer.
  let rotinas = 0;
  const comLembrete = await db.select({ userId: rotinasPessoais.userId }).from(rotinasPessoais).where(isNotNull(rotinasPessoais.lembreteHora));
  const hoje = checklistDayISO();
  const agora = minutesIntoChecklistDay(new Date());
  for (const userId of new Set(comLembrete.map((r) => r.userId))) {
    for (const r of await getMinhasRotinas(userId)) {
      if (!r.aplicaHoje || !r.lembreteHora || r.itens.every((i) => i.feito)) continue;
      const [h, m] = r.lembreteHora.split(":").map(Number);
      const hora = h < 2 ? h * 60 + m + 24 * 60 : h * 60 + m; // vira o dia às 02:00
      const passou = agora - hora;
      if (passou >= 0 && passou <= ATRASO_MAXIMO) {
        const faltam = r.itens.filter((i) => !i.feito).length;
        if (await enviarPushUmaVez(userId, `rotina:${r.id}:${hoje}`, { titulo: r.nome, corpo: `Faltam ${faltam} ${faltam === 1 ? "item" : "itens"} da sua rotina.`, url: "/rotinas", tag: `rotina-${r.id}` })) rotinas++;
      }
    }
  }

  // Fim do turno: lembra gerentes e líderes (com aviso ativado) de fechar o dia, se ainda não fecharam.
  let fechar = 0;
  if (agora >= HORA_FECHAR_DIA && agora - HORA_FECHAR_DIA <= ATRASO_MAXIMO) {
    const candidatos = await db
      .select({ id: users.id })
      .from(users)
      .innerJoin(pushInscricoes, eq(pushInscricoes.userId, users.id))
      .where(and(inArray(users.profile, ["gerente", "lider"]), isNotNull(users.unitId)));
    const jaFecharam = new Set((await db.select({ userId: fechamentosDia.userId }).from(fechamentosDia).where(eq(fechamentosDia.date, hoje))).map((f) => f.userId));
    for (const id of new Set(candidatos.map((c) => c.id))) {
      if (jaFecharam.has(id)) continue;
      if (await enviarPushUmaVez(id, `fechar-dia:${hoje}`, { titulo: "Hora de fechar o dia", corpo: "Veja o resumo do dia e feche o turno.", url: "/resumo-do-dia", tag: "fechar-dia" })) fechar++;
    }
  }
  return Response.json({ ok: true, prazo, atraso, rotinas, fechar });
}

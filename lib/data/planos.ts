import { and, asc, desc, eq, gt, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { anomalies, planoAcoes, planoAnomalias, planosAcao, units, users } from "@/lib/db/schema";
import { checklistDayISO } from "@/lib/date-utils";

export const ETAPAS = [
  { chave: "plan", letra: "P", nome: "Planejar", ajuda: "Entender o problema, achar a causa e definir as ações" },
  { chave: "do", letra: "D", nome: "Executar", ajuda: "Cada responsável faz a sua ação" },
  { chave: "check", letra: "C", nome: "Verificar", ajuda: "O problema voltou a acontecer?" },
  { chave: "act", letra: "A", nome: "Agir", ajuda: "Padronizar o que funcionou ou começar um novo ciclo" },
] as const;
export type Etapa = (typeof ETAPAS)[number]["chave"] | "encerrado";

export const STATUS_ACAO: Record<string, string> = { a_fazer: "A fazer", em_andamento: "Em andamento", feita: "Feita" };
export const RESULTADO: Record<string, string> = { eficaz: "Eficaz: não voltou", parcial: "Parcial: diminuiu", nao_eficaz: "Não eficaz: continua" };

export async function getPlanos(orgId: number) {
  const hoje = checklistDayISO();
  const planos = await db.select().from(planosAcao).where(eq(planosAcao.organizationId, orgId)).orderBy(desc(planosAcao.createdAt)).limit(200);
  if (planos.length === 0) return [];
  const acoes = await db.select({ planoId: planoAcoes.planoId, status: planoAcoes.status, prazo: planoAcoes.prazo }).from(planoAcoes).where(inArray(planoAcoes.planoId, planos.map((p) => p.id)));
  return planos.map((p) => {
    const a = acoes.filter((x) => x.planoId === p.id);
    return { ...p, total: a.length, feitas: a.filter((x) => x.status === "feita").length, atrasadas: a.filter((x) => x.status !== "feita" && x.prazo < hoje).length };
  });
}

export async function getPlano(orgId: number, id: number) {
  const [plano] = await db.select().from(planosAcao).where(and(eq(planosAcao.id, id), eq(planosAcao.organizationId, orgId))).limit(1);
  if (!plano) return null;
  const [acoes, ligadas] = await Promise.all([
    db.select({ a: planoAcoes, responsavel: users.name }).from(planoAcoes).innerJoin(users, eq(users.id, planoAcoes.responsavelId)).where(eq(planoAcoes.planoId, id)).orderBy(asc(planoAcoes.prazo), asc(planoAcoes.id)),
    db
      .select({ id: anomalies.id, date: anomalies.date, tipos: anomalies.tipos, setores: anomalies.setores, unitId: anomalies.unitId, unitName: units.name, oQueAconteceu: anomalies.oQueAconteceu })
      .from(planoAnomalias)
      .innerJoin(anomalies, eq(anomalies.id, planoAnomalias.anomaliaId))
      .innerJoin(units, eq(units.id, anomalies.unitId))
      .where(eq(planoAnomalias.planoId, id)),
  ]);
  const tipos = [...new Set(ligadas.flatMap((l) => l.tipos))];
  const setores = [...new Set(ligadas.flatMap((l) => l.setores))];
  const unidades = [...new Set(ligadas.map((l) => l.unitId))];
  // Reincidência: anomalias do mesmo tipo e setor, nas mesmas unidades, depois que o plano nasceu.
  const desde = plano.createdAt.toISOString().slice(0, 10);
  const reincidencias =
    tipos.length && setores.length && unidades.length
      ? await db
          .select({ id: anomalies.id, date: anomalies.date, unitName: units.name, tipos: anomalies.tipos })
          .from(anomalies)
          .innerJoin(units, eq(units.id, anomalies.unitId))
          .where(
            and(
              eq(anomalies.organizationId, orgId),
              gt(anomalies.date, desde),
              inArray(anomalies.unitId, unidades),
              sql`${anomalies.tipos} && ${sql.raw(`ARRAY[${tipos.map((t) => `'${t.replace(/'/g, "''")}'`).join(",")}]::text[]`)}`,
              sql`${anomalies.setores} && ${sql.raw(`ARRAY[${setores.map((t) => `'${t.replace(/'/g, "''")}'`).join(",")}]::text[]`)}`,
            ),
          )
          .orderBy(desc(anomalies.date))
          .limit(50)
      : [];
  return { plano, acoes: acoes.map((x) => ({ ...x.a, responsavel: x.responsavel })), ligadas, reincidencias };
}

export async function getMinhasAcoes(userId: number) {
  return db
    .select({ a: planoAcoes, plano: planosAcao.titulo, etapa: planosAcao.etapa })
    .from(planoAcoes)
    .innerJoin(planosAcao, eq(planosAcao.id, planoAcoes.planoId))
    .where(and(eq(planoAcoes.responsavelId, userId), ne(planosAcao.etapa, "encerrado")))
    .orderBy(asc(planoAcoes.prazo));
}

export async function getResponsaveis(orgId: number) {
  return db.select({ id: users.id, name: users.name, profile: users.profile }).from(users).where(eq(users.organizationId, orgId)).orderBy(asc(users.name));
}

/** Padrões nas anomalias dos últimos `dias` dias: quem mais aparece e o que se repete. */
export async function getAnalise(orgId: number, dias: number) {
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10);
  const rows = await db
    .select({ id: anomalies.id, date: anomalies.date, tipos: anomalies.tipos, setores: anomalies.setores, unitId: anomalies.unitId, unitName: units.name, status: anomalies.status })
    .from(anomalies)
    .innerJoin(units, eq(units.id, anomalies.unitId))
    .where(and(eq(anomalies.organizationId, orgId), sql`${anomalies.date} >= ${desde}`))
    .orderBy(desc(anomalies.date))
    .limit(3000);
  const conta = (chaves: string[]) => {
    const m = new Map<string, number>();
    for (const k of chaves) m.set(k, (m.get(k) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const porTipo = conta(rows.flatMap((r) => r.tipos));
  const porSetor = conta(rows.flatMap((r) => r.setores));
  const porUnidade = conta(rows.map((r) => r.unitName));
  // recorrência: mesma unidade + tipo + setor
  const comb = new Map<string, { unitName: string; tipo: string; setor: string; ids: number[] }>();
  for (const r of rows) for (const t of r.tipos) for (const s of r.setores) {
    const k = `${r.unitId}|${t}|${s}`;
    const c = comb.get(k) ?? { unitName: r.unitName, tipo: t, setor: s, ids: [] };
    c.ids.push(r.id);
    comb.set(k, c);
  }
  const recorrencias = [...comb.values()].filter((c) => c.ids.length >= 3).sort((a, b) => b.ids.length - a.ids.length).slice(0, 10);
  // por semana (segunda a domingo)
  const semanas = new Map<string, number>();
  for (const r of rows) {
    const d = new Date(`${r.date}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    const k = d.toISOString().slice(0, 10);
    semanas.set(k, (semanas.get(k) ?? 0) + 1);
  }
  return { total: rows.length, abertas: rows.filter((r) => r.status === "aberta").length, porTipo, porSetor, porUnidade, recorrencias, semanas: [...semanas.entries()].sort((a, b) => a[0].localeCompare(b[0])) };
}

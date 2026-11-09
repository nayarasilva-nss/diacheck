import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { rotinaItens, rotinaMarcas, rotinasPessoais } from "@/lib/db/schema";
import { checklistDayForInstant, checklistDayISO, daysBeforeISO } from "@/lib/date-utils";

export type RotinaView = {
  id: number;
  nome: string;
  dias: number[];
  lembreteHora: string | null;
  aplicaHoje: boolean;
  itens: { id: number; texto: string; feito: boolean }[];
};

/** Dia da semana (0 = domingo) de uma data AAAA-MM-DD. */
export function diaDaSemana(iso: string) {
  return new Date(`${iso}T12:00:00Z`).getUTCDay();
}

/** Rotinas da pessoa, com o que já foi marcado hoje (dia de checklist, vira às 02:00). */
export async function getMinhasRotinas(userId: number): Promise<RotinaView[]> {
  const hoje = checklistDayISO();
  const dow = diaDaSemana(hoje);
  const rotinas = await db.select().from(rotinasPessoais).where(eq(rotinasPessoais.userId, userId)).orderBy(asc(rotinasPessoais.id));
  if (rotinas.length === 0) return [];
  const itens = await db.select().from(rotinaItens).where(inArray(rotinaItens.rotinaId, rotinas.map((r) => r.id))).orderBy(asc(rotinaItens.posicao), asc(rotinaItens.id));
  const marcas = itens.length
    ? await db.select({ itemId: rotinaMarcas.itemId }).from(rotinaMarcas).where(and(inArray(rotinaMarcas.itemId, itens.map((i) => i.id)), eq(rotinaMarcas.date, hoje)))
    : [];
  const feitos = new Set(marcas.map((m) => m.itemId));
  return rotinas.map((r) => ({
    id: r.id,
    nome: r.nome,
    dias: r.dias,
    lembreteHora: r.lembreteHora,
    aplicaHoje: r.dias.length === 0 || r.dias.includes(dow),
    itens: itens.filter((i) => i.rotinaId === r.id).map((i) => ({ id: i.id, texto: i.texto, feito: feitos.has(i.id) })),
  }));
}

/** Por dia: quantas rotinas valiam e quantas ficaram 100% concluídas (só a partir do dia em que foram criadas). */
export async function getRotinasPorDia(userId: number, from: string, to: string) {
  const porDia = new Map<string, { esperados: number; feitos: number }>();
  const rotinas = await db.select().from(rotinasPessoais).where(eq(rotinasPessoais.userId, userId));
  if (rotinas.length === 0) return porDia;
  const itens = await db.select().from(rotinaItens).where(inArray(rotinaItens.rotinaId, rotinas.map((r) => r.id)));
  const marcas = itens.length
    ? await db.select({ itemId: rotinaMarcas.itemId, date: rotinaMarcas.date }).from(rotinaMarcas).where(and(inArray(rotinaMarcas.itemId, itens.map((i) => i.id)), gte(rotinaMarcas.date, from), lte(rotinaMarcas.date, to)))
    : [];
  const feito = new Set(marcas.map((m) => `${m.itemId}|${m.date}`));
  for (let d = from; d <= to; d = daysBeforeISO(d, -1)) {
    const dow = diaDaSemana(d);
    for (const r of rotinas) {
      if (r.dias.length > 0 && !r.dias.includes(dow)) continue;
      if (d < checklistDayForInstant(r.createdAt)) continue;
      const its = itens.filter((i) => i.rotinaId === r.id);
      if (its.length === 0) continue;
      const cur = porDia.get(d) ?? { esperados: 0, feitos: 0 };
      cur.esperados++;
      if (its.every((i) => feito.has(`${i.id}|${d}`))) cur.feitos++;
      porDia.set(d, cur);
    }
  }
  return porDia;
}

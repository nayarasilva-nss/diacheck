import { checklistDayISO, daysBeforeISO } from "@/lib/date-utils";
import { getDiasDaPessoa } from "@/lib/data/painel";
import { getRotinasPorDia } from "@/lib/data/rotinas";

export type DiaEvolucao = { date: string; esperados: number; feitos: number; status: "ok" | "parcial" | "falhou" | "sem" };

const JANELA = 60;

/** Sequência e evolução da pessoa: um dia vale quando ela fez tudo o que era esperado
 * (checklists e rotinas). Dia sem nada esperado (folga) não conta nem quebra a sequência;
 * o dia de hoje, ainda em andamento, não quebra. */
export async function getEvolucao(organizationId: number, userId: number, unitId: number | null) {
  const hoje = checklistDayISO();
  const from = daysBeforeISO(hoje, JANELA - 1);
  const [chk, rot] = await Promise.all([getDiasDaPessoa(organizationId, userId, unitId, from, hoje), getRotinasPorDia(userId, from, hoje)]);

  const dias: DiaEvolucao[] = [];
  for (let d = from; d <= hoje; d = daysBeforeISO(d, -1)) {
    const a = chk.get(d) ?? { esperados: 0, feitos: 0 };
    const b = rot.get(d) ?? { esperados: 0, feitos: 0 };
    const esperados = a.esperados + b.esperados;
    const feitos = a.feitos + b.feitos;
    dias.push({ date: d, esperados, feitos, status: esperados === 0 ? "sem" : feitos === esperados ? "ok" : feitos > 0 ? "parcial" : "falhou" });
  }

  let atual = 0;
  for (let i = dias.length - 1; i >= 0; i--) {
    const x = dias[i];
    if (x.status === "sem") continue;
    if (x.status === "ok") { atual++; continue; }
    if (x.date === hoje) continue; // hoje ainda pode fechar
    break;
  }
  let melhor = 0;
  let corrida = 0;
  for (const x of dias) {
    if (x.status === "sem") continue;
    if (x.status === "ok") { corrida++; melhor = Math.max(melhor, corrida); }
    else if (x.date !== hoje) corrida = 0;
  }

  const ultimos30 = dias.slice(-30).filter((x) => x.status !== "sem" && x.date !== hoje);
  const ok30 = ultimos30.filter((x) => x.status === "ok").length;
  return { dias: dias.slice(-30), atual, melhor, diasComMeta: ultimos30.length, ok30, taxa30: ultimos30.length ? Math.round((ok30 / ultimos30.length) * 100) : null };
}

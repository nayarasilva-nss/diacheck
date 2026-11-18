import "server-only";
import { and, eq, isNull, lt, lte, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { anomalies, requisicoes } from "@/lib/db/schema";
import { checklistDayISO, daysAgoISO } from "@/lib/date-utils";
import { caixaNoErp } from "@/lib/erp/caixa";
import { ligacaoDaEmpresa } from "@/lib/erp/integracao";

/**
 * O que a loja deve hoje e o gerente cobra (18/11/2026): eram três rotinas do ERP que só mandavam a pessoa para cá — o caixa
 * de ontem, as requisições sem conferir e as ocorrências paradas. Agora ficam aqui, no Hoje, e saíram do ERP.
 */
export type PendenciasDaLoja = { caixaOntem: boolean; requisicoes: number; ocorrencias: number; ontem: string };

export async function getPendenciasDaLoja(
  unit: { id: number; cnpj: string | null } | null,
  organizationId: number,
  verCaixa: boolean,
): Promise<PendenciasDaLoja | null> {
  if (!unit) return null;
  const hoje = checklistDayISO();
  const ontem = daysAgoISO(1);
  const inicioDoDia = new Date(`${hoje}T03:00:00Z`); // 00:00 em Brasília
  const [req, oco] = await Promise.all([
    // requisição lançada antes de hoje e ainda não conferida: sem a conferência o ERP não baixa o estoque
    db.select({ n: sql<number>`count(*)::int` }).from(requisicoes)
      .where(and(eq(requisicoes.organizationId, organizationId), eq(requisicoes.unitId, unit.id),
        eq(requisicoes.status, "aberta"), lt(requisicoes.createdAt, inicioDoDia))),
    // ocorrência aberta há mais de 3 dias sem a ação tomada
    db.select({ n: sql<number>`count(*)::int` }).from(anomalies)
      .where(and(eq(anomalies.organizationId, organizationId), eq(anomalies.unitId, unit.id), eq(anomalies.status, "aberta"),
        lte(anomalies.date, daysAgoISO(3)), or(isNull(anomalies.acaoTomada), eq(anomalies.acaoTomada, "")))),
  ]);
  // o caixa de ontem: pergunta ao ERP se chegou (sem ligação, ou com o ERP fora do ar, não cobra)
  let caixaOntem = false;
  if (verCaixa && unit.cnpj) {
    try {
      const ligacao = await ligacaoDaEmpresa(organizationId);
      if (ligacao) {
        const dia = await caixaNoErp(unit.cnpj, ontem, ligacao);
        caixaOntem = (!dia.desde || ontem >= dia.desde) && dia.fechamentos.length === 0;
      }
    } catch { /* ERP fora do ar: não cobra o caixa agora */ }
  }
  return { caixaOntem, requisicoes: req[0]?.n ?? 0, ocorrencias: oco[0]?.n ?? 0, ontem };
}

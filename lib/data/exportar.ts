import { and, asc, eq, gte, lt, lte, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { anomalies, checklistCompletions, checklistTypeItems, checklistTypes, requisicaoItens, requisicoes, units, users } from "@/lib/db/schema";
import { daysBeforeISO } from "@/lib/date-utils";

export type Tabela = { nomeArquivo: string; colunas: string[]; linhas: (string | number | null)[][] };

const LIMITE = 50_000;
const dataBR = (d: string) => d.split("-").reverse().join("/");
const dataHoraBR = (d: Date | null) =>
  d ? d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : null;

const STATUS_CHECK: Record<string, string> = { conforme: "Conforme", "nao-conforme": "Não conforme", "nao-se-aplica": "Não se aplica", pending: "Pendente" };

export async function exportarChecklists(orgId: number, de: string, ate: string): Promise<Tabela> {
  const unidadeId = sql`coalesce(${checklistCompletions.unitId}, ${users.unitId})`;
  const rows = await db
    .select({
      date: checklistCompletions.date,
      unidade: units.name,
      pessoa: users.name,
      checklist: checklistTypes.name,
      item: checklistTypeItems.label,
      status: checklistCompletions.status,
      justificativa: checklistCompletions.justification,
      concluidoEm: checklistCompletions.completedAt,
      foto: checklistCompletions.photoUrl,
    })
    .from(checklistCompletions)
    .innerJoin(checklistTypes, eq(checklistTypes.id, checklistCompletions.checklistTypeId))
    .innerJoin(checklistTypeItems, eq(checklistTypeItems.id, checklistCompletions.itemId))
    .innerJoin(users, eq(users.id, checklistCompletions.userId))
    .leftJoin(units, sql`${units.id} = ${unidadeId}`)
    .where(and(eq(checklistTypes.organizationId, orgId), gte(checklistCompletions.date, de), lte(checklistCompletions.date, ate), ne(checklistCompletions.status, "pending")))
    .orderBy(asc(checklistCompletions.date), asc(checklistTypes.name), asc(checklistTypeItems.id))
    .limit(LIMITE);
  return {
    nomeArquivo: `checklists-${de}-a-${ate}`,
    colunas: ["Data", "Unidade", "Responsável", "Checklist", "Item", "Status", "Justificativa", "Concluído em", "Foto"],
    linhas: rows.map((r) => [dataBR(r.date), r.unidade, r.pessoa, r.checklist, r.item, STATUS_CHECK[r.status] ?? r.status, r.justificativa, dataHoraBR(r.concluidoEm), r.foto]),
  };
}

export async function exportarAnomalias(orgId: number, de: string, ate: string): Promise<Tabela> {
  const rows = await db
    .select({ a: anomalies, unidade: units.name })
    .from(anomalies)
    .innerJoin(units, eq(units.id, anomalies.unitId))
    .where(and(eq(anomalies.organizationId, orgId), gte(anomalies.date, de), lte(anomalies.date, ate)))
    .orderBy(asc(anomalies.date), asc(anomalies.id))
    .limit(LIMITE);
  return {
    nomeArquivo: `anomalias-${de}-a-${ate}`,
    colunas: ["Data", "Unidade", "Relator", "Tipos", "Setores", "Colaboradores envolvidos", "O que aconteceu", "Causa percebida", "Consequência imediata", "Ação tomada", "Sugestão de tratativa", "Situação"],
    linhas: rows.map(({ a, unidade }) => [dataBR(a.date), unidade, a.relator, a.tipos.join(", "), a.setores.join(", "), a.colaboradoresEnvolvidos, a.oQueAconteceu, a.causaPercebida, a.consequenciaImediata, a.acaoTomada, a.sugestaoTratativa, a.status === "aberta" ? "Aberta" : "Tratada"]),
  };
}

export async function exportarRequisicoes(orgId: number, de: string, ate: string): Promise<Tabela> {
  // dia de calendário em Brasília (UTC-3): 00:00 BRT = 03:00 UTC
  const inicio = new Date(`${de}T03:00:00Z`);
  const fim = new Date(`${daysBeforeISO(ate, -1)}T03:00:00Z`);
  const solicitante = users;
  const rows = await db
    .select({
      id: requisicoes.id,
      criadaEm: requisicoes.createdAt,
      tipo: requisicoes.tipo,
      status: requisicoes.status,
      urgente: requisicoes.urgente,
      unidade: units.name,
      solicitante: solicitante.name,
      obs: requisicoes.observacao,
      item: requisicaoItens.nome,
      un: requisicaoItens.unidadeMedida,
      pedida: requisicaoItens.qtdPedida,
      conferida: requisicaoItens.qtdConferida,
      recebida: requisicaoItens.qtdRecebida,
    })
    .from(requisicoes)
    .innerJoin(requisicaoItens, eq(requisicaoItens.requisicaoId, requisicoes.id))
    .innerJoin(units, eq(units.id, requisicoes.unitId))
    .innerJoin(solicitante, eq(solicitante.id, requisicoes.requesterId))
    .where(and(eq(requisicoes.organizationId, orgId), gte(requisicoes.createdAt, inicio), lt(requisicoes.createdAt, fim)))
    .orderBy(asc(requisicoes.createdAt), asc(requisicaoItens.id))
    .limit(LIMITE);
  return {
    nomeArquivo: `requisicoes-${de}-a-${ate}`,
    colunas: ["Nº", "Criada em", "Tipo", "Situação", "Urgente", "Unidade", "Solicitante", "Observação", "Item", "Unidade de medida", "Qtd. pedida", "Qtd. conferida", "Qtd. recebida"],
    linhas: rows.map((r) => [r.id, dataHoraBR(r.criadaEm), r.tipo === "interna" ? "Interna" : "Externa", r.status, r.urgente ? "Sim" : "Não", r.unidade, r.solicitante, r.obs || null, r.item, r.un, r.pedida, r.conferida, r.recebida]),
  };
}

/** CSV para o Excel em português: separador ";", BOM UTF-8 e aspas nos campos com ; " ou quebra de linha.
 * Células que começam com = + - @ ganham um apóstrofo, para não virarem fórmula na planilha. */
export function paraCsv(t: Tabela) {
  const cel = (v: string | number | null) => {
    if (v === null || v === undefined) return "";
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s) && typeof v === "string") s = `'${s}`;
    return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [t.colunas, ...t.linhas].map((l) => l.map(cel).join(";")).join("\r\n") + "\r\n";
}

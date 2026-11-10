"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { db } from "@/lib/db";
import { anomalies, planoAcoes, planoAnomalias, planosAcao, users } from "@/lib/db/schema";
import { getCurrentUser, requireGestor } from "@/lib/auth/dal";
import { isGestorProfile } from "@/lib/auth/profile";
import { enviarPush } from "@/lib/push";

export type PlanoState = { error?: string } | undefined;

const iso = /^\d{4}-\d{2}-\d{2}$/;
const txt = (f: FormData, k: string, max: number) => String(f.get(k) ?? "").trim().slice(0, max);

async function responsavelValido(orgId: number, id: number) {
  const [u] = await db.select({ id: users.id }).from(users).where(and(eq(users.id, id), eq(users.organizationId, orgId))).limit(1);
  return Boolean(u);
}

function avisarResponsavel(ids: number[], titulo: string, planoId: number) {
  after(() => enviarPush(ids, { titulo: "Você recebeu uma ação", corpo: titulo, url: "/planos-de-acao", tag: `plano-${planoId}` }));
}

/** P do PDCA: cria o plano a partir de anomalias, já com as primeiras ações (vai direto para a etapa D). */
export async function criarPlano(_prev: PlanoState, formData: FormData): Promise<PlanoState> {
  const gestor = await requireGestor();
  const orgId = gestor.organizationId!;
  const titulo = txt(formData, "titulo", 160);
  const problema = txt(formData, "problema", 2000);
  const causaRaiz = txt(formData, "causaRaiz", 2000);
  const meta = txt(formData, "meta", 1000);
  const verificarEm = txt(formData, "verificarEm", 10);
  const anomaliaIds = formData.getAll("anomaliaIds").map(Number).filter(Boolean);
  if (!titulo) return { error: "Dê um nome para o plano" };
  if (!problema) return { error: "Descreva o problema" };
  if (!iso.test(verificarEm)) return { error: "Escolha a data para verificar se funcionou" };

  const descs = formData.getAll("acaoDescricao").map((v) => String(v).trim().slice(0, 500));
  const resps = formData.getAll("acaoResponsavel").map(Number);
  const prazos = formData.getAll("acaoPrazo").map((v) => String(v));
  const acoes: { descricao: string; responsavelId: number; prazo: string }[] = [];
  for (let i = 0; i < descs.length; i++) {
    if (!descs[i] && !resps[i] && !prazos[i]) continue;
    if (!descs[i] || !resps[i] || !iso.test(prazos[i] ?? "")) return { error: `Ação ${i + 1}: preencha o que fazer, quem e até quando` };
    if (!(await responsavelValido(orgId, resps[i]))) return { error: `Ação ${i + 1}: responsável inválido` };
    acoes.push({ descricao: descs[i], responsavelId: resps[i], prazo: prazos[i] });
  }
  if (acoes.length === 0) return { error: "Inclua ao menos uma ação" };

  const validas = anomaliaIds.length ? await db.select({ id: anomalies.id }).from(anomalies).where(and(eq(anomalies.organizationId, orgId), inArray(anomalies.id, anomaliaIds))) : [];
  const [plano] = await db.insert(planosAcao).values({ organizationId: orgId, titulo, problema, causaRaiz, meta, verificarEm, etapa: "do", criadoPorId: gestor.id }).returning({ id: planosAcao.id });
  if (validas.length) await db.insert(planoAnomalias).values(validas.map((a) => ({ planoId: plano.id, anomaliaId: a.id })));
  await db.insert(planoAcoes).values(acoes.map((a) => ({ planoId: plano.id, ...a })));
  avisarResponsavel([...new Set(acoes.map((a) => a.responsavelId))].filter((id) => id !== gestor.id), titulo, plano.id);
  revalidatePath("/planos-de-acao");
  redirect(`/planos-de-acao/${plano.id}`);
}

/** D: o responsável (ou o gestor) atualiza a ação. Quando todas estão feitas, o plano vai para C e o gestor é avisado. */
export async function atualizarAcao(formData: FormData) {
  const user = await getCurrentUser();
  const id = Number(formData.get("id"));
  const status = String(formData.get("status") ?? "");
  if (!["a_fazer", "em_andamento", "feita"].includes(status)) return;
  const [row] = await db.select({ a: planoAcoes, p: planosAcao }).from(planoAcoes).innerJoin(planosAcao, eq(planosAcao.id, planoAcoes.planoId)).where(eq(planoAcoes.id, id)).limit(1);
  if (!row || row.p.organizationId !== user.organizationId) return;
  if (row.a.responsavelId !== user.id && !isGestorProfile(user.profile)) return;
  if (row.p.etapa === "encerrado") return;
  const nota = txt(formData, "nota", 1000) || null;
  await db.update(planoAcoes).set({ status, notaExecucao: nota ?? row.a.notaExecucao, concluidoEm: status === "feita" ? new Date() : null }).where(eq(planoAcoes.id, id));

  const todas = await db.select({ status: planoAcoes.status }).from(planoAcoes).where(eq(planoAcoes.planoId, row.p.id));
  const tudoFeito = todas.length > 0 && todas.every((x) => x.status === "feita");
  if (tudoFeito && row.p.etapa === "do") {
    await db.update(planosAcao).set({ etapa: "check" }).where(eq(planosAcao.id, row.p.id));
    after(() => enviarPush([row.p.criadoPorId], { titulo: "Plano de ação pronto para verificar", corpo: row.p.titulo, url: `/planos-de-acao/${row.p.id}`, tag: `plano-${row.p.id}` }));
  } else if (!tudoFeito && row.p.etapa === "check") {
    await db.update(planosAcao).set({ etapa: "do" }).where(eq(planosAcao.id, row.p.id));
  }
  revalidatePath("/planos-de-acao");
  revalidatePath(`/planos-de-acao/${row.p.id}`);
}

export async function adicionarAcao(_prev: PlanoState, formData: FormData): Promise<PlanoState> {
  const gestor = await requireGestor();
  const orgId = gestor.organizationId!;
  const planoId = Number(formData.get("planoId"));
  const descricao = txt(formData, "descricao", 500);
  const responsavelId = Number(formData.get("responsavelId"));
  const prazo = txt(formData, "prazo", 10);
  if (!descricao || !responsavelId || !iso.test(prazo)) return { error: "Preencha o que fazer, quem e até quando" };
  const [plano] = await db.select().from(planosAcao).where(and(eq(planosAcao.id, planoId), eq(planosAcao.organizationId, orgId))).limit(1);
  if (!plano || plano.etapa === "encerrado") return { error: "Plano não encontrado" };
  if (!(await responsavelValido(orgId, responsavelId))) return { error: "Responsável inválido" };
  await db.insert(planoAcoes).values({ planoId, descricao, responsavelId, prazo });
  if (plano.etapa !== "do") await db.update(planosAcao).set({ etapa: "do" }).where(eq(planosAcao.id, planoId));
  if (responsavelId !== gestor.id) avisarResponsavel([responsavelId], plano.titulo, planoId);
  revalidatePath(`/planos-de-acao/${planoId}`);
  revalidatePath("/planos-de-acao");
}

export async function atualizarPlano(_prev: PlanoState, formData: FormData): Promise<PlanoState> {
  const gestor = await requireGestor();
  const id = Number(formData.get("id"));
  const titulo = txt(formData, "titulo", 160);
  const verificarEm = txt(formData, "verificarEm", 10);
  if (!titulo || !iso.test(verificarEm)) return { error: "Informe o nome e a data de verificação" };
  await db.update(planosAcao).set({ titulo, problema: txt(formData, "problema", 2000), causaRaiz: txt(formData, "causaRaiz", 2000), meta: txt(formData, "meta", 1000), verificarEm }).where(and(eq(planosAcao.id, id), eq(planosAcao.organizationId, gestor.organizationId!)));
  revalidatePath(`/planos-de-acao/${id}`);
}

/** C: o gestor registra se funcionou. */
export async function registrarVerificacao(_prev: PlanoState, formData: FormData): Promise<PlanoState> {
  const gestor = await requireGestor();
  const id = Number(formData.get("id"));
  const resultado = String(formData.get("resultado") ?? "");
  const nota = txt(formData, "nota", 1500);
  if (!["eficaz", "parcial", "nao_eficaz"].includes(resultado)) return { error: "Escolha o resultado da verificação" };
  if (!nota) return { error: "Escreva o que você viu (ex.: quantas vezes o problema voltou)" };
  await db.update(planosAcao).set({ etapa: "act", verificacaoResultado: resultado, verificacaoNota: nota }).where(and(eq(planosAcao.id, id), eq(planosAcao.organizationId, gestor.organizationId!)));
  revalidatePath(`/planos-de-acao/${id}`);
  revalidatePath("/planos-de-acao");
}

/** A: padroniza e encerra, ou abre um novo ciclo (outro plano, ciclo + 1, com as mesmas anomalias). */
export async function agirNoPlano(_prev: PlanoState, formData: FormData): Promise<PlanoState> {
  const gestor = await requireGestor();
  const orgId = gestor.organizationId!;
  const id = Number(formData.get("id"));
  const decisao = String(formData.get("decisao") ?? "");
  const nota = txt(formData, "nota", 1500);
  const [plano] = await db.select().from(planosAcao).where(and(eq(planosAcao.id, id), eq(planosAcao.organizationId, orgId))).limit(1);
  if (!plano || plano.etapa !== "act") return { error: "Plano não está na etapa de agir" };

  if (decisao === "padronizar") {
    if (!nota) return { error: "Escreva o que virou padrão (ex.: item novo no checklist, treinamento feito)" };
    await db.update(planosAcao).set({ etapa: "encerrado", padronizacaoNota: nota, encerradoEm: new Date() }).where(eq(planosAcao.id, id));
    revalidatePath("/planos-de-acao");
    redirect("/planos-de-acao");
  }
  if (decisao === "novo_ciclo") {
    const [novo] = await db.insert(planosAcao).values({ organizationId: orgId, titulo: plano.titulo, problema: plano.problema, causaRaiz: plano.causaRaiz, meta: plano.meta, etapa: "plan", ciclo: plano.ciclo + 1, planoOrigemId: plano.id, criadoPorId: gestor.id }).returning({ id: planosAcao.id });
    const ligadas = await db.select({ a: planoAnomalias.anomaliaId }).from(planoAnomalias).where(eq(planoAnomalias.planoId, id));
    if (ligadas.length) await db.insert(planoAnomalias).values(ligadas.map((l) => ({ planoId: novo.id, anomaliaId: l.a })));
    await db.update(planosAcao).set({ etapa: "encerrado", padronizacaoNota: nota || "Novo ciclo aberto.", encerradoEm: new Date() }).where(eq(planosAcao.id, id));
    revalidatePath("/planos-de-acao");
    redirect(`/planos-de-acao/${novo.id}`);
  }
  return { error: "Escolha: padronizar ou começar um novo ciclo" };
}

export async function excluirPlano(formData: FormData) {
  const gestor = await requireGestor();
  await db.delete(planosAcao).where(and(eq(planosAcao.id, Number(formData.get("id"))), eq(planosAcao.organizationId, gestor.organizationId!)));
  revalidatePath("/planos-de-acao");
  redirect("/planos-de-acao");
}

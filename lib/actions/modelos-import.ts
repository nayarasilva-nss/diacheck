"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireGestor } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { checklistTypeItems, checklistTypes, jobFunctions } from "@/lib/db/schema";
import { chaveNome, lerPlanilha, type ErroLinha, type ModeloLido } from "@/lib/checklist-planilha";

export type Previa = {
  criar: (ModeloLido & { funcaoId: number | null })[];
  pular: string[];
  erros: ErroLinha[];
};
export type ResultadoImport = { previa?: Previa; criados?: number; error?: string };

/** Separa o que será criado, o que já existe (pulado) e o que tem erro. Roda no servidor de novo ao confirmar. */
async function classificar(orgId: number, modelos: ModeloLido[], erros: ErroLinha[]): Promise<Previa> {
  const [existentes, funcoes] = await Promise.all([
    db.select({ name: checklistTypes.name }).from(checklistTypes).where(eq(checklistTypes.organizationId, orgId)),
    db.select({ id: jobFunctions.id, name: jobFunctions.name }).from(jobFunctions).where(eq(jobFunctions.organizationId, orgId)),
  ]);
  const jaExiste = new Set(existentes.map((e) => chaveNome(e.name)));
  const porFuncao = new Map(funcoes.map((f) => [chaveNome(f.name), f.id]));
  const criar: Previa["criar"] = [];
  const pular: string[] = [];
  const todosErros = [...erros];
  for (const m of modelos) {
    if (jaExiste.has(chaveNome(m.nome))) { pular.push(m.nome); continue; }
    let funcaoId: number | null = null;
    if (m.funcaoNome) {
      funcaoId = porFuncao.get(chaveNome(m.funcaoNome)) ?? null;
      if (!funcaoId) { todosErros.push({ linha: 0, msg: `"${m.nome}": a função "${m.funcaoNome}" não está cadastrada. Cadastre em Pessoas › Funções ou corrija a planilha.` }); continue; }
    }
    criar.push({ ...m, funcaoId });
  }
  return { criar, pular, erros: todosErros };
}

/** Passo 1: lê o arquivo e devolve a prévia. Não grava nada. */
export async function analisarPlanilha(_prev: ResultadoImport | undefined, formData: FormData): Promise<ResultadoImport> {
  const gestor = await requireGestor();
  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return { error: "Escolha o arquivo da planilha (.xlsx)" };
  if (arquivo.size > 2 * 1024 * 1024) return { error: "O arquivo passa de 2 MB" };
  const { modelos, erros } = await lerPlanilha(Buffer.from(await arquivo.arrayBuffer()));
  return { previa: await classificar(gestor.organizationId!, modelos, erros) };
}

/** Passo 2: grava o que a prévia mostrou (revalidando tudo no servidor). */
export async function confirmarImportacao(modelosJson: string): Promise<ResultadoImport> {
  const gestor = await requireGestor();
  let lidos: ModeloLido[];
  try {
    lidos = JSON.parse(modelosJson) as ModeloLido[];
  } catch {
    return { error: "Prévia inválida. Envie a planilha de novo." };
  }
  if (!Array.isArray(lidos) || lidos.length === 0 || lidos.length > 100) return { error: "Nada para importar." };
  const limpos: ModeloLido[] = lidos
    .map((m) => ({
      nome: String(m.nome ?? "").trim().slice(0, 255),
      tipo: (m.tipo === "weekly" ? "weekly" : "daily") as "daily" | "weekly",
      funcaoNome: m.funcaoNome ? String(m.funcaoNome) : null,
      horario: m.horario && /^([01]\d|2[0-3]):[0-5]\d$/.test(m.horario) ? m.horario : null,
      descricao: String(m.descricao ?? "").slice(0, 2000),
      itens: (Array.isArray(m.itens) ? m.itens : []).slice(0, 500).map((i) => ({ label: String(i.label ?? "").trim().slice(0, 2000), requiresPhoto: Boolean(i.requiresPhoto) })).filter((i) => i.label),
    }))
    .filter((m) => m.nome && m.itens.length > 0);
  const previa = await classificar(gestor.organizationId!, limpos, []);
  if (previa.erros.length > 0) return { previa, error: "Há erros. Corrija a planilha e envie de novo." };

  let criados = 0;
  for (const m of previa.criar) {
    // checagem final contra duplicata (duas importações ao mesmo tempo)
    const [dup] = await db.select({ id: checklistTypes.id }).from(checklistTypes).where(and(eq(checklistTypes.organizationId, gestor.organizationId!), eq(checklistTypes.name, m.nome))).limit(1);
    if (dup) continue;
    const [novo] = await db
      .insert(checklistTypes)
      .values({ organizationId: gestor.organizationId!, name: m.nome, description: m.descricao, deadlineTime: m.horario, type: m.tipo, jobFunctionId: m.funcaoId })
      .returning({ id: checklistTypes.id });
    await db.insert(checklistTypeItems).values(m.itens.map((i, position) => ({ checklistTypeId: novo.id, label: i.label, requiresPhoto: i.requiresPhoto, position })));
    criados++;
  }
  for (const p of ["/gerenciar", "/checklist", "/hoje"]) revalidatePath(p);
  return { criados, previa };
}

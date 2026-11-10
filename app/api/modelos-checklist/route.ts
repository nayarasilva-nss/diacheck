import { asc, eq, inArray } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/dal";
import { isGestorProfile } from "@/lib/auth/profile";
import { db } from "@/lib/db";
import { checklistTypeItems, checklistTypes, jobFunctions } from "@/lib/db/schema";
import { montarPlanilha } from "@/lib/checklist-planilha";

/** ?acao=modelo: planilha em branco com exemplo. ?acao=exportar: os modelos que a empresa já tem, no mesmo formato. Só Gestor. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!isGestorProfile(user.profile) || !user.organizationId) return new Response("Sem permissão", { status: 403 });
  const orgId = user.organizationId;
  const acao = new URL(req.url).searchParams.get("acao");

  const funcoes = (await db.select({ name: jobFunctions.name }).from(jobFunctions).where(eq(jobFunctions.organizationId, orgId)).orderBy(asc(jobFunctions.name))).map((f) => f.name);
  let buffer: Buffer;
  let nome: string;
  if (acao === "exportar") {
    const tipos = await db
      .select({ id: checklistTypes.id, name: checklistTypes.name, type: checklistTypes.type, desc: checklistTypes.description, horario: checklistTypes.deadlineTime, funcao: jobFunctions.name })
      .from(checklistTypes)
      .leftJoin(jobFunctions, eq(jobFunctions.id, checklistTypes.jobFunctionId))
      .where(eq(checklistTypes.organizationId, orgId))
      .orderBy(asc(checklistTypes.name));
    const itens = tipos.length ? await db.select().from(checklistTypeItems).where(inArray(checklistTypeItems.checklistTypeId, tipos.map((t) => t.id))).orderBy(asc(checklistTypeItems.checklistTypeId), asc(checklistTypeItems.position)) : [];
    buffer = await montarPlanilha(
      tipos.map((t) => ({ nome: t.name, tipo: t.type, funcao: t.funcao, horario: t.horario, descricao: t.desc, itens: itens.filter((i) => i.checklistTypeId === t.id).map((i) => ({ label: i.label, requiresPhoto: i.requiresPhoto })) })),
      funcoes,
      false,
    );
    nome = "modelos-de-checklist.xlsx";
  } else if (acao === "modelo") {
    buffer = await montarPlanilha([], funcoes, true);
    nome = "modelo-importar-checklists.xlsx";
  } else {
    return new Response("Ação inválida", { status: 400 });
  }
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nome}"`,
      "Cache-Control": "no-store",
    },
  });
}

import { getCurrentUser } from "@/lib/auth/dal";
import { isGestorProfile } from "@/lib/auth/profile";
import { exportarAnomalias, exportarChecklists, exportarRequisicoes, paraCsv } from "@/lib/data/exportar";
import { daysBeforeISO } from "@/lib/date-utils";

/** Exportação em CSV (Excel) dos registros da empresa, só para o Gestor. ?tipo=checklists|anomalias|requisicoes&de=AAAA-MM-DD&ate=AAAA-MM-DD */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!isGestorProfile(user.profile) || !user.organizationId) return new Response("Sem permissão", { status: 403 });

  const p = new URL(req.url).searchParams;
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const de = p.get("de") ?? "";
  const ate = p.get("ate") ?? "";
  if (!iso.test(de) || !iso.test(ate) || de > ate) return new Response("Período inválido", { status: 400 });
  if (daysBeforeISO(ate, 366) > de) return new Response("O período máximo é de um ano", { status: 400 });

  const tipo = p.get("tipo");
  const tabela =
    tipo === "checklists" ? await exportarChecklists(user.organizationId, de, ate)
    : tipo === "anomalias" ? await exportarAnomalias(user.organizationId, de, ate)
    : tipo === "requisicoes" ? await exportarRequisicoes(user.organizationId, de, ate)
    : null;
  if (!tabela) return new Response("Tipo inválido", { status: 400 });

  return new Response(paraCsv(tabela), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${tabela.nomeArquivo}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

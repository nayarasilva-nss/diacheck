import { resolveBrandColors } from "@/lib/branding";
import { getCurrentUser } from "@/lib/auth/dal";
import { resolveEffectiveUnitId } from "@/lib/auth/covering-unit";
import { canConferirRequisicao } from "@/lib/auth/requisicoes";
import { getRequisicaoWithItens, resolveRequisicaoScope } from "@/lib/data/requisicoes";
import { renderRequisicaoPdf } from "@/lib/pdf/requisicao-report";
import { nomeArquivoRequisicao } from "@/lib/pdf/nome-arquivo";
import { checklistDayForInstant } from "@/lib/date-utils";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!id) return Response.json({ error: "Requisição inválida" }, { status: 400 });

  const requisicao = await getRequisicaoWithItens(id, user.organizationId!);
  if (!requisicao) return Response.json({ error: "Não encontrada" }, { status: 404 });

  // Mesma regra de quem enxerga a requisição na lista (ver
  // resolveRequisicaoScope) — senão alguém que já vê o pedido lá (ex:
  // Gerente vendo tudo da unidade) pedia o PDF e recebia um 403 sem
  // entender por quê.
  const effectiveUnitId = await resolveEffectiveUnitId(user);
  const scope = resolveRequisicaoScope({ ...user, unitId: effectiveUnitId });
  const podeVer =
    requisicao.requesterId === user.id ||
    canConferirRequisicao(user, requisicao.tipo as "interna" | "externa") ||
    scope?.mode === "all" ||
    (scope?.mode === "unit" && scope.unitId === requisicao.unitId);
  if (!podeVer) return Response.json({ error: "Sem permissão" }, { status: 403 });

  const nome = nomeArquivoRequisicao({ tipo: requisicao.tipo, unitName: requisicao.unitName, dia: checklistDayForInstant(requisicao.createdAt) });
  const pdf = await renderRequisicaoPdf(
    requisicao,
    { name: user.organizationName ?? "DiaCheck", logoUrl: user.organizationLogoUrl, slug: user.organizationSlug, brandColor: resolveBrandColors(user.organizationPrimaryColor).red },
    new URL(req.url).origin,
  );

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nome}"; filename*=UTF-8''${nome}`,
      "Cache-Control": "private, no-store",
    },
  });
}

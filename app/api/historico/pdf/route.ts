import { resolveBrandColors } from "@/lib/branding";
import { isGestorProfile } from "@/lib/auth/profile";
import { getCurrentUser } from "@/lib/auth/dal";
import { getChecklistExportData } from "@/lib/data/checklists";
import { resolveUnitScope } from "@/lib/data/units";
import { renderChecklistPdf } from "@/lib/pdf/checklist-report";
import { nomeArquivoChecklist } from "@/lib/pdf/nome-arquivo";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  const { searchParams } = new URL(req.url);
  const checklistTypeId = Number(searchParams.get("checklistTypeId"));
  const userId = Number(searchParams.get("userId"));
  const date = searchParams.get("date");
  const rawUnitId = searchParams.get("unitId");
  const unitId = rawUnitId ? Number(rawUnitId) : null;
  if (!checklistTypeId || !userId || !date) {
    return Response.json({ error: "Parâmetros inválidos" }, { status: 400 });
  }

  // Mesma regra do Histórico: gestor vê tudo, o resto só a própria unidade.
  const allowedUnitId = resolveUnitScope(user, unitId);
  if (!isGestorProfile(user.profile) && allowedUnitId !== unitId) {
    return Response.json({ error: "Sem permissão" }, { status: 403 });
  }

  const data = await getChecklistExportData(checklistTypeId, userId, date, unitId, user.organizationId!);
  if (!data) return Response.json({ error: "Não encontrado" }, { status: 404 });

  const nome = nomeArquivoChecklist({ checklist: data.checklistType.name, unitName: data.unitName, dia: data.date });
  const pdf = await renderChecklistPdf(
    data,
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

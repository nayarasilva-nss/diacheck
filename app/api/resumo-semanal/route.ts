import { getCurrentUser } from "@/lib/auth/dal";
import { getPainelGestor } from "@/lib/data/painel";
import { getAnomaliesByScope } from "@/lib/data/anomalies";
import { renderResumoSemanal } from "@/lib/pdf/resumo-semanal";
import { checklistDayISO, daysBeforeISO } from "@/lib/date-utils";
import { loadDiaCheckLogo, loadOrgLogo } from "@/lib/pdf/shared";
import { resolveBrandColors } from "@/lib/branding";

/**
 * O resumo semanal em PDF (Início › Indicadores › Resumo da semana): a
 * semana de segunda a domingo antes da escolhida — ou a passada, na
 * segunda. ?de / ?ate (AAAA-MM-DD) sobrepõem, para reimprimir uma semana.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user.organizationId) return new Response("Conta sem empresa associada.", { status: 403 });

  const url = new URL(req.url);
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const hoje = checklistDayISO();
  // a segunda-feira da semana de `d`
  const segunda = (d: string) => {
    const dt = new Date(`${d}T12:00:00Z`);
    dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
    return dt.toISOString().slice(0, 10);
  };

  let de = url.searchParams.get("de") ?? "";
  let ate = url.searchParams.get("ate") ?? "";
  if (!iso.test(de) || !iso.test(ate)) {
    ate = daysBeforeISO(segunda(hoje), 1);   // domingo da semana passada
    de = segunda(ate);
  }
  if (de > ate) [de, ate] = [ate, de];

  const { totals, unidades, ranking } = await getPainelGestor(user.organizationId, de, ate, null, null);

  // Quem deixou de concluir o que era esperado (o ranking traz todos; aqui só os com falha).
  const pessoas = ranking
    .filter((r) => r.completionRate < 100)
    .slice(0, 25)
    .map((r) => ({ nome: r.name, unidade: r.unitName, esperados: r.expected, concluidos: r.concluded, taxa: r.completionRate }));

  const abertas = await getAnomaliesByScope({ mode: "unit", unitId: null }, user.organizationId, { sinceDate: de });
  const emAberto = abertas.filter((a) => a.status === "aberta" && a.date <= ate).slice(0, 30);

  const origem = url.origin;
  const [logo, dcLogo] = await Promise.all([loadOrgLogo({ logoUrl: user.organizationLogoUrl, slug: user.organizationSlug }, origem), loadDiaCheckLogo(origem)]);

  const fmt = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("pt-BR");
  const pdf = await renderResumoSemanal({
    empresa: user.organizationName ?? "DiaCheck",
    de: fmt(de),
    até: fmt(ate),
    geradoEm: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
    esperados: totals.scheduled,
    concluidos: totals.concluded,
    taxa: totals.completionRate,
    pontualidade: null,
    unidades: unidades.map((u) => ({ nome: u.unitName, esperados: u.expected, concluidos: u.concluded, taxa: u.completionRate, pontualidade: u.punctuality })),
    pessoas,
    anomaliasAbertas: emAberto.map((a) => ({
      data: fmt(a.date),
      unidade: a.unitName ?? "—",
      tipos: Array.isArray(a.tipos) ? a.tipos.join(", ") : String(a.tipos ?? ""),
      detalhe: a.oQueAconteceu ?? null,
    })),
    logo,
    dcLogo,
    brandColor: resolveBrandColors(user.organizationPrimaryColor).red,
  });

  const nome = `resumo-semanal-${de}.pdf`;
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nome}"; filename*=UTF-8''${nome}`,
      "Cache-Control": "private, no-store",
    },
  });
}

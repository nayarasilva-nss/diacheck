import { getCurrentUser } from "@/lib/auth/dal";
import { isGestorProfile } from "@/lib/auth/profile";
import { resolveEffectiveUnitId } from "@/lib/auth/covering-unit";
import { resolveEffectiveJobFunctionId } from "@/lib/auth/gestor-funcao";
import { getChecklistsForUser } from "@/lib/data/checklists";
import { getAnomaliesByScope } from "@/lib/data/anomalies";
import { getOpenPendenciasForUnit } from "@/lib/data/shift-logs";
import { getAtrasosHoje } from "@/lib/data/painel";
import { getMinhasRotinas } from "@/lib/data/rotinas";
import { checklistDayISO } from "@/lib/date-utils";

type User = Awaited<ReturnType<typeof getCurrentUser>>;

/** Tudo o que o Resumo do dia mostra, calculado na hora para a pessoa logada. */
export async function getResumoDoDia(user: User) {
  const orgId = user.organizationId!;
  const hoje = checklistDayISO();
  const isGestor = isGestorProfile(user.profile);
  const viewer = {
    id: user.id,
    profile: user.profile,
    organizationId: orgId,
    jobFunctionId: await resolveEffectiveJobFunctionId(user),
    unitId: user.unitId,
    effectiveUnitId: await resolveEffectiveUnitId(user),
  };
  const [checklists, rotinas, minhasAnomalias, pendencias, atrasos] = await Promise.all([
    getChecklistsForUser("daily", viewer),
    getMinhasRotinas(user.id),
    getAnomaliesByScope({ mode: "own", userId: user.id }, orgId, { sinceDate: hoje }),
    user.unitId ? getOpenPendenciasForUnit(user.unitId, orgId) : Promise.resolve([]),
    isGestor ? getAtrasosHoje(orgId, null) : Promise.resolve([]),
  ]);

  const linhas = checklists.map((c) => ({
    id: c.id,
    nome: c.name,
    feitos: c.items.filter((i) => i.status !== "pending").length,
    total: c.items.length,
  }));
  const checklistsPendentes = linhas.filter((l) => l.feitos < l.total);
  const rotinasHoje = rotinas.filter((r) => r.aplicaHoje);
  const rotinasPendentes = rotinasHoje.filter((r) => r.itens.some((i) => !i.feito));
  const anomaliasHoje = minhasAnomalias.filter((a) => a.date === hoje);
  return {
    hoje,
    isGestor,
    linhas,
    checklistsPendentes,
    rotinasHoje,
    rotinasPendentes,
    anomaliasHoje,
    pendencias,
    atrasos,
    faltam: checklistsPendentes.length + rotinasPendentes.length,
  };
}

export type ResumoDia = Awaited<ReturnType<typeof getResumoDoDia>>;

/** Versão enxuta guardada ao fechar o dia. */
export function resumoParaGuardar(r: ResumoDia) {
  return {
    checklists: { feitos: r.linhas.length - r.checklistsPendentes.length, total: r.linhas.length },
    rotinas: { feitas: r.rotinasHoje.length - r.rotinasPendentes.length, total: r.rotinasHoje.length },
    anomalias: r.anomaliasHoje.length,
    pendentes: [...r.checklistsPendentes.map((c) => `Checklist: ${c.nome} (${c.feitos}/${c.total})`), ...r.rotinasPendentes.map((x) => `Rotina: ${x.nome}`)],
    pendenciasDiario: r.pendencias.length,
  };
}

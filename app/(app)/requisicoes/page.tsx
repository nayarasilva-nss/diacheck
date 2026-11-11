import { redirect } from "next/navigation";
import { isGestorProfile } from "@/lib/auth/profile";
import { getCurrentUser } from "@/lib/auth/dal";
import { resolveEffectiveUnitId } from "@/lib/auth/covering-unit";
import { canConferirInterna, canConferirExterna, tiposPermitidos } from "@/lib/auth/requisicoes";
import {
  resolveRequisicaoScope,
  getRequisicoesByScope,
  getRequisicoesForLink,
} from "@/lib/data/requisicoes";
import { getCatalogCategories, getCatalogItemsParaRequisicao } from "@/lib/data/catalog";
import { getUnits } from "@/lib/data/units";
import { todayWeekdayBrazil } from "@/lib/date-utils";
import { situacaoComprasNoErp } from "@/lib/erp/integracao";
import { RequisicoesBoard } from "./RequisicoesBoard";

export default async function RequisicoesPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string }>;
}) {
  const user = await getCurrentUser();
  const effectiveUnitId = await resolveEffectiveUnitId(user);
  const scope = resolveRequisicaoScope({ ...user, unitId: effectiveUnitId });
  if (!scope) {
    redirect("/hoje");
  }

  const { tipo } = await searchParams;
  const criarTiposPermitidos = tiposPermitidos(user);

  const tabs =
    scope.mode === "unit" || scope.mode === "all"
      ? (["interna", "externa"] as const)
      : criarTiposPermitidos;

  const activeTipo = tipo === "interna" || tipo === "externa" ? tipo : (tabs[0] ?? null);

  const canConferir = activeTipo === "interna" ? canConferirInterna(user) : canConferirExterna(user);
  const canCreate = criarTiposPermitidos.length > 0;
  // Quem não tem unidade fixa (Gestor) escolhe a unidade na hora de criar.
  const needsUnitPicker = canCreate && !effectiveUnitId;

  // Gestor e gerente veem o catálogo inteiro; os demais, o do setor da função.
  const veTudo = isGestorProfile(user.profile) || user.profile === "gerente";
  const [records, categorias, catalogo, units] = await Promise.all([
    getRequisicoesByScope(
      resolveRequisicaoScope({ ...user, unitId: effectiveUnitId }, activeTipo) ?? scope,
      user.organizationId!,
      activeTipo,
    ),
    canCreate ? getCatalogCategories(user.organizationId!) : Promise.resolve([]),
    canCreate
      ? getCatalogItemsParaRequisicao(user.organizationId!, user.jobFunctionId ?? null, veTudo)
      : Promise.resolve({ setor: null, itens: [] }),
    needsUnitPicker ? getUnits(user.organizationId!) : Promise.resolve([]),
  ]);

  // Candidatas a "requisição original" pro seletor de excedente, por
  // unidade — quem não tem unidade fixa (Gestor) só escolhe a unidade
  // dentro do formulário, então buscamos pra todas as unidades que ele
  // pode escolher, não só a efetiva do dia.
  const unitIdsParaVinculo = needsUnitPicker ? units.map((u) => u.id) : effectiveUnitId ? [effectiveUnitId] : [];
  const linkCandidatesByUnit: Record<number, { interna: Awaited<ReturnType<typeof getRequisicoesForLink>>; externa: Awaited<ReturnType<typeof getRequisicoesForLink>> }> = {};
  if (canCreate && unitIdsParaVinculo.length > 0) {
    await Promise.all(
      unitIdsParaVinculo.map(async (unitId) => {
        const [interna, externa] = await Promise.all([
          criarTiposPermitidos.includes("interna") ? getRequisicoesForLink(unitId, "interna", user.organizationId!) : Promise.resolve([]),
          criarTiposPermitidos.includes("externa") ? getRequisicoesForLink(unitId, "externa", user.organizationId!) : Promise.resolve([]),
        ]);
        linkCandidatesByUnit[unitId] = { interna, externa };
      }),
    );
  }

  // a parte que vai por Compras: a fase dela no ERP (aguardando, em cotação, pedido feito, recebida)
  const comCompras = records.filter((r) => r.tipo === "externa" && r.itens.some((i) => i.destino === "compras")).map((r) => r.id);
  const situacaoCompras = await situacaoComprasNoErp(comCompras.slice(0, 200), user.organizationId!);

  return (
    <RequisicoesBoard
      records={records}
      tipo={activeTipo}
      tabs={[...tabs]}
      canCreate={canCreate}
      canConferir={canConferir}
      currentUserId={user.id}
      categorias={categorias}
      catalogItems={catalogo.itens}
      setorFiltro={catalogo.setor}
      units={units}
      todayWeekday={todayWeekdayBrazil()}
      criarTiposPermitidos={criarTiposPermitidos}
      linkCandidatesByUnit={linkCandidatesByUnit}
      fixedUnitId={effectiveUnitId}
      extraUnitIds={user.requisicaoUnidadesExtras ?? []}
      isGestor={isGestorProfile(user.profile)}
      isMaster={user.profile === "master"}
      canReceber={user.profile === "gerente" || isGestorProfile(user.profile)}
      situacaoCompras={situacaoCompras}
    />
  );
}

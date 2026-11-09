import { getCurrentUser } from "@/lib/auth/dal";
import { canSubmitFilleting } from "@/lib/data/filleting";
import { canSubmitRestoIngesta } from "@/lib/data/resto-ingesta";
import { canCoverOtherUnits, getCoveringUnit } from "@/lib/auth/covering-unit";
import { getGestorFuncao } from "@/lib/auth/gestor-funcao";
import { canVerEscala } from "@/lib/auth/escala";
import { canVerEstoque } from "@/lib/auth/estoque";
import { resolveRequisicaoScope } from "@/lib/data/requisicoes";
import { tiposPermitidos } from "@/lib/auth/requisicoes";
import { canCreateSolicitacao } from "@/lib/auth/solicitacoes";
import { getFormDefinitions } from "@/lib/data/form-definitions";
import { isPlatformOperator } from "@/lib/data/organizations";
import { getUnits, getJobFunctions } from "@/lib/data/units";
import { getPendingCoAudits } from "@/lib/data/audits";
import { logout } from "@/lib/auth/actions";
import { isGestorProfile } from "@/lib/auth/profile";
import { resolveBrandColors } from "@/lib/branding";
import { canContar } from "@/lib/auth/contagem";
import { canFecharCaixa } from "@/lib/auth/caixa";
import { ligacaoDaEmpresa } from "@/lib/erp/integracao";
import { AppNav } from "./AppNav";
import { CoveringUnitBanner } from "./CoveringUnitBanner";
import { GestorFuncaoBanner } from "./GestorFuncaoBanner";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (user.organizationStatus === "pending" || user.organizationStatus === "suspended") {
    const isPending = user.organizationStatus === "pending";
    return (
      <div className="login-container">
        <div className="login-card">
          <h1>{isPending ? "Conta em análise" : "Conta desativada"}</h1>
          <p>
            {isPending
              ? "Recebemos o cadastro da sua empresa e ele está sendo revisado pela nossa equipe. Assim que for aprovado, você já poderá usar o sistema normalmente com este mesmo login."
              : "O acesso da sua empresa foi desativado. Se você acha que isso é um engano, entre em contato com quem administra sua conta no DiaCheck."}
          </p>
          <form action={logout}>
            <button className="btn-login" type="submit">
              Sair
            </button>
          </form>
        </div>
      </div>
    );
  }

  const showCoveringUnitBanner = canCoverOtherUnits(user);
  const isGestor = isGestorProfile(user.profile);
  const showRequisicoes = resolveRequisicaoScope(user) !== null;
  const canCreateRequisicao = tiposPermitidos(user).length > 0;
  const showSolicitacoes = canCreateSolicitacao(user);
  const [covering, units, atuando, jobFunctions, orgFormDefinitions, pendingCoAudits] = await Promise.all([
    showCoveringUnitBanner ? getCoveringUnit() : Promise.resolve(null),
    showCoveringUnitBanner ? getUnits(user.organizationId!) : Promise.resolve([]),
    isGestor ? getGestorFuncao() : Promise.resolve(null),
    isGestor ? getJobFunctions(user.organizationId!) : Promise.resolve([]),
    user.organizationId
      ? getFormDefinitions(user.organizationId, { onlyActive: true })
      : Promise.resolve([]),
    isGestor ? getPendingCoAudits(user.organizationId!, user.id) : Promise.resolve([]),
  ]);
  // Aparece no menu quando a empresa tem pelo menos um formulário
  // personalizado ativo — a própria tela filtra o que essa pessoa pode
  // de fato preencher, mesmo padrão de "Perdas" sempre aparecer no menu.
  const showFormularios = orgFormDefinitions.length > 0;
  const showPlataforma = isPlatformOperator(user);
  const brand = resolveBrandColors(user.organizationPrimaryColor);
  // Os módulos de ERP só existem para a empresa com a ligação dela (ou o servidor antigo com env vars).
  const temErp = await ligacaoDaEmpresa(user.organizationId);
  const modulosErp = Boolean(temErp);

  return (
    <div className="app-shell">
      <style>{`:root{
        --kenkyo-red: ${brand.red};
        --kenkyo-red-deep: ${brand.redDeep};
        --kenkyo-red-light: ${brand.redLight};
        --kenkyo-gradient: ${brand.gradient};
        --kenkyo-glow: ${brand.glow};
        --kenkyo-tint: ${brand.tint};
        --kenkyo-tint-soft: ${brand.tintSoft};
        --kenkyo-on-tint: ${brand.onTint};
      }`}</style>
      <AppNav
        userName={user.name}
        profile={user.profile}
        jobFunctionName={user.jobFunctionName}
        vapidKey={process.env.VAPID_PUBLIC_KEY}
        orgName={user.organizationName ?? "DiaCheck"}
        orgLogoUrl={user.organizationLogoUrl ?? (user.organizationSlug === "kenkyo" ? "/kenkyo-logo.png" : "/diacheck-icon.png")}
        canCreateAnomaly={user.profile !== "rh"}
        canSubmitFilleting={canSubmitFilleting(user)}
        canSubmitRestoIngesta={canSubmitRestoIngesta(user)}
        canWriteShiftLog={user.profile === "gerente" || user.profile === "lider"}
        showRequisicoes={showRequisicoes}
        showContagem={canContar(user) && modulosErp}
        showCaixa={canFecharCaixa(user) && modulosErp}
        showEscala={canVerEscala(user)}
        showEstoque={canVerEstoque(user) && modulosErp}
        canCreateRequisicao={canCreateRequisicao}
        showSolicitacoes={showSolicitacoes}
        showFormularios={showFormularios}
        showPlataforma={showPlataforma}
        pendingAuditCount={pendingCoAudits.length}
        contexto={
          showCoveringUnitBanner || isGestor ? (
            <>
              {showCoveringUnitBanner && (
                <CoveringUnitBanner units={units} homeUnitId={user.unitId} covering={covering} />
              )}
              {isGestor && <GestorFuncaoBanner jobFunctions={jobFunctions} atuando={atuando} />}
            </>
          ) : null
        }
      />
      <div className="app-main">
        <div className="content">
          <div className="tab-content">{children}</div>
        </div>
      </div>
    </div>
  );
}

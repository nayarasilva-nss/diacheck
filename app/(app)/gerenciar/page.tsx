import Link from "next/link";
import { requireGestor } from "@/lib/auth/dal";
import {
  getUsers,
  getChecklistTypesWithCounts,
  getUnits,
  getJobFunctions,
} from "@/lib/data/manage";
import { getCatalogCategories, getCatalogItems } from "@/lib/data/catalog";
import { getFormDefinitions } from "@/lib/data/form-definitions";
import { getOrganizationById } from "@/lib/data/organizations";
import { BrandForm } from "./BrandForm";
import { AuditoriaBoard } from "./AuditoriaBoard";
import { getAuditTemplate } from "@/lib/data/audits";
import { ErpPainel } from "./ErpPainel";
import { EscalaPainel } from "./EscalaPainel";
import { ImportarModelos } from "./ImportarModelos";
import { ModelosBoard } from "./ModelosBoard";
import { UsuariosBoard } from "./UsuariosBoard";
import { CatalogoBoard } from "./CatalogoBoard";
import { FormulariosBoard } from "./FormulariosBoard";
import { FuncoesUnidadesBoard } from "./FuncoesUnidadesBoard";

// Abas agrupadas por assunto. As chaves (?tab=...) continuam as mesmas, então links antigos seguem valendo.
type Grupo = { key: string; label: string; ajuda: string; tabs: { key: string; label: string }[] };
const GRUPOS: Grupo[] = [
  {
    key: "pessoas",
    label: "Pessoas",
    ajuda: "Quem usa o sistema, o que cada função faz e quando cada um folga.",
    tabs: [
      { key: "usuarios", label: "Usuários" },
      { key: "funcoes", label: "Funções" },
      { key: "escala", label: "Escala" },
    ],
  },
  {
    key: "operacao",
    label: "Operação",
    ajuda: "O que a equipe preenche no dia a dia e como a unidade é avaliada.",
    tabs: [
      { key: "modelos", label: "Modelos de checklist" },
      { key: "formularios", label: "Formulários" },
      { key: "auditoria", label: "Auditoria" },
    ],
  },
  {
    key: "estoque",
    label: "Estoque e ERP",
    ajuda: "Itens que podem ser pedidos e a ligação com o ERP da empresa.",
    tabs: [
      { key: "catalogo", label: "Catálogo" },
      { key: "erp", label: "ERP" },
    ],
  },
  {
    key: "empresa",
    label: "Empresa",
    ajuda: "Unidades e a marca da empresa (logo e cor).",
    tabs: [
      { key: "unidades", label: "Unidades" },
      { key: "marca", label: "Marca" },
    ],
  },
];

const TABS = GRUPOS.flatMap((g) => g.tabs);

export default async function GerenciarPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const gestor = await requireGestor();

  const { tab: rawTab } = await searchParams;
  const tab = TABS.some((t) => t.key === rawTab) ? rawTab! : "usuarios";

  const [users, checklistTypes, units, jobFunctions, catalogCategories, catalogItems, formDefinitions, organization, auditTemplate] =
    await Promise.all([
      getUsers(gestor.organizationId!),
      getChecklistTypesWithCounts(gestor.organizationId!),
      getUnits(gestor.organizationId!),
      getJobFunctions(gestor.organizationId!),
      getCatalogCategories(gestor.organizationId!),
      getCatalogItems(gestor.organizationId!),
      gestor.organizationId ? getFormDefinitions(gestor.organizationId) : Promise.resolve([]),
      gestor.organizationId ? getOrganizationById(gestor.organizationId) : Promise.resolve(null),
      tab === "auditoria" ? getAuditTemplate(gestor.organizationId!) : Promise.resolve([]),
    ]);

  return (
    <>
      <div className="page-topbar">
        <h2 style={{ marginBottom: 0 }}>Gerenciar</h2>
      </div>

      {(() => {
        const grupo = GRUPOS.find((g) => g.tabs.some((t) => t.key === tab)) ?? GRUPOS[0];
        return (
          <>
            <div className="filter-pills" role="tablist" aria-label="Assuntos">
              {GRUPOS.map((g) => (
                <Link
                  key={g.key}
                  href={`/gerenciar?tab=${g.tabs[0].key}`}
                  className={`pill${g.key === grupo.key ? " active" : ""}`}
                  aria-current={g.key === grupo.key ? "page" : undefined}
                >
                  {g.label}
                </Link>
              ))}
            </div>
            <p className="items-count" style={{ margin: "4px 0 10px" }}>{grupo.ajuda}</p>
            {grupo.tabs.length > 1 && (
              <div className="gerenciar-subtabs">
                {grupo.tabs.map((t) => (
                  <Link key={t.key} href={`/gerenciar?tab=${t.key}`} className={tab === t.key ? "active" : undefined}>
                    {t.label}
                  </Link>
                ))}
              </div>
            )}
          </>
        );
      })()}

      {tab === "escala" && <EscalaPainel organizationId={gestor.organizationId!} />}

      {tab === "usuarios" && <UsuariosBoard usuarios={users} units={units} jobFunctions={jobFunctions} />}

      {tab === "modelos" && <ImportarModelos />}

      {tab === "modelos" && (
        <ModelosBoard modelos={checklistTypes} jobFunctions={jobFunctions} users={users} />
      )}

      {tab === "formularios" && <FormulariosBoard definitions={formDefinitions} jobFunctions={jobFunctions} />}

      {tab === "unidades" && (
        <FuncoesUnidadesBoard
          tipo="unidade"
          itens={units.map((u) => ({
            id: u.id,
            name: u.name,
            pessoas: users.filter((x) => x.unitId === u.id).length,
            noErp: Boolean(u.erpCnpj),
          }))}
        />
      )}

      {tab === "funcoes" && (
        <FuncoesUnidadesBoard
          tipo="funcao"
          itens={jobFunctions.map((f) => ({
            id: f.id,
            name: f.name,
            pessoas: users.filter((x) => x.jobFunctionId === f.id).length,
            modelos: checklistTypes.filter((c) => c.jobFunctionId === f.id).length,
          }))}
        />
      )}

      {tab === "catalogo" && <CatalogoBoard categorias={catalogCategories} produtos={catalogItems} />}

      {tab === "erp" && <ErpPainel organizationId={gestor.organizationId!} />}

      {tab === "auditoria" && <AuditoriaBoard groups={auditTemplate} />}

      {tab === "marca" && organization && (
        <div className="board-layout">
          <div className="detail-panel" style={{ minHeight: "auto" }}>
            <p className="items-count" style={{ marginBottom: 14 }}>
              Nome, logo e cor usados no menu, nos documentos gerados (PDFs de checklist e
              requisição) e no visual do sistema pra quem faz login na sua empresa.
            </p>
            <BrandForm organization={organization} />
          </div>
        </div>
      )}
    </>
  );
}

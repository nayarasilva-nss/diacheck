import Link from "next/link";
import { requireGestor } from "@/lib/auth/dal";
import {
  getUsers,
  getChecklistTypesWithCounts,
  getUnits,
  getJobFunctions,
} from "@/lib/data/manage";
import { deleteUnit } from "@/lib/actions/manage";
import { getCatalogCategories, getCatalogItems } from "@/lib/data/catalog";
import { AddUserForm } from "./AddUserForm";
import { UserRow } from "./UserRow";
import { AddChecklistTypeForm } from "./AddChecklistTypeForm";
import { ChecklistTypeRow } from "./ChecklistTypeRow";
import { AddUnitForm } from "./AddUnitForm";
import { AddJobFunctionForm } from "./AddJobFunctionForm";
import { JobFunctionRow } from "./JobFunctionRow";
import { DeleteButton } from "./DeleteButton";
import { AddCategoryForm } from "./AddCategoryForm";
import { CategoryRow } from "./CategoryRow";
import { AddCatalogItemForm } from "./AddCatalogItemForm";
import { CatalogItemRow } from "./CatalogItemRow";
import { AddFormDefinitionForm } from "./AddFormDefinitionForm";
import { FormDefinitionRow } from "./FormDefinitionRow";
import { getFormDefinitions } from "@/lib/data/form-definitions";
import { getOrganizationById } from "@/lib/data/organizations";
import { BrandForm } from "./BrandForm";
import { AuditTemplateEditor } from "./AuditTemplateEditor";
import { getAuditTemplate } from "@/lib/data/audits";
import { ErpPainel } from "./ErpPainel";
import { EscalaPainel } from "./EscalaPainel";

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

      {tab === "usuarios" && (
        <div className="board-layout">
          <div className="today-card">
            <div className="today-card-title" style={{ marginBottom: 14 }}>
              Usuários · {users.length}
            </div>
            {users.map((user) => (
              <UserRow key={user.id} user={user} units={units} jobFunctions={jobFunctions} />
            ))}
          </div>
          <div className="detail-panel" style={{ minHeight: "auto" }}>
            <AddUserForm units={units} jobFunctions={jobFunctions} />
          </div>
        </div>
      )}

      {tab === "modelos" && (
        <div className="board-layout">
          <div className="today-card">
            <div className="today-card-title" style={{ marginBottom: 14 }}>
              Modelos de Checklist · {checklistTypes.length}
            </div>
            {checklistTypes.map((c) => (
              <ChecklistTypeRow
                key={c.id}
                checklistType={c}
                jobFunctions={jobFunctions}
                users={users}
                allChecklistTypes={checklistTypes}
              />
            ))}
          </div>
          <div className="detail-panel" style={{ minHeight: "auto" }}>
            <AddChecklistTypeForm
              jobFunctions={jobFunctions}
              users={users}
              allChecklistTypes={checklistTypes}
            />
          </div>
        </div>
      )}

      {tab === "formularios" && (
        <div className="board-layout">
          <div className="today-card">
            <div className="today-card-title" style={{ marginBottom: 14 }}>
              Formulários personalizados · {formDefinitions.length}
            </div>
            <p className="items-count" style={{ marginBottom: 14 }}>
              Pra registros operacionais que não têm uma tela dedicada — aparecem em &quot;Formulários&quot; pra quem tiver permissão.
            </p>
            {formDefinitions.map((def) => (
              <FormDefinitionRow key={def.id} definition={def} jobFunctions={jobFunctions} />
            ))}
          </div>
          <div className="detail-panel" style={{ minHeight: "auto" }}>
            <AddFormDefinitionForm jobFunctions={jobFunctions} />
          </div>
        </div>
      )}

      {tab === "unidades" && (
        <div className="board-layout">
          <div className="today-card">
            <div className="today-card-title" style={{ marginBottom: 14 }}>
              Unidades · {units.length}
            </div>
            {units.map((unit) => (
              <div className="list-item" key={unit.id}>
                <div className="info">
                  <h4>{unit.name}</h4>
                </div>
                <div className="list-item-actions">
                  <DeleteButton
                    action={deleteUnit}
                    id={unit.id}
                    confirmText={`Deletar a unidade "${unit.name}"?`}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="detail-panel" style={{ minHeight: "auto" }}>
            <AddUnitForm />
          </div>
        </div>
      )}

      {tab === "funcoes" && (
        <div className="board-layout">
          <div className="today-card">
            <div className="today-card-title" style={{ marginBottom: 14 }}>
              Funções · {jobFunctions.length}
            </div>
            {jobFunctions.map((jobFunction) => (
              <JobFunctionRow key={jobFunction.id} jobFunction={jobFunction} />
            ))}
          </div>
          <div className="detail-panel" style={{ minHeight: "auto" }}>
            <AddJobFunctionForm />
          </div>
        </div>
      )}

      {tab === "catalogo" && (
        <div className="board-layout">
          <div className="today-card">
            <div className="today-card-title" style={{ marginBottom: 14 }}>
              Categorias · {catalogCategories.length}
            </div>
            {catalogCategories.map((category) => (
              <CategoryRow key={category.id} category={category} />
            ))}
          </div>
          <div className="detail-panel" style={{ minHeight: "auto" }}>
            <AddCategoryForm />
          </div>

          <div className="today-card">
            <div className="today-card-title" style={{ marginBottom: 14 }}>
              Produtos · {catalogItems.length}
            </div>
            {catalogItems.map((item) => (
              <CatalogItemRow key={item.id} item={item} categories={catalogCategories} />
            ))}
          </div>
          <div className="detail-panel" style={{ minHeight: "auto" }}>
            <AddCatalogItemForm categories={catalogCategories} />
          </div>
        </div>
      )}

      {tab === "erp" && <ErpPainel organizationId={gestor.organizationId!} />}

      {tab === "auditoria" && <AuditTemplateEditor groups={auditTemplate} />}

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

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/dal";
import {
  isPlatformOperator,
  getAllOrganizationsWithStats,
  getUsoRecente,
  type OrganizationStatus,
} from "@/lib/data/organizations";
import { OrganizationStatusActions } from "./OrganizationStatusActions";
import { db } from "@/lib/db";
import { interesses } from "@/lib/db/schema";
import { desc } from "drizzle-orm";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  active: "Ativa",
  suspended: "Suspensa",
};

export default async function PlataformaPage() {
  const user = await getCurrentUser();
  if (!isPlatformOperator(user)) redirect("/hoje");

  const [orgs, uso, pedidos] = await Promise.all([getAllOrganizationsWithStats(), getUsoRecente(), db.select().from(interesses).orderBy(desc(interesses.createdAt)).limit(30)]);

  return (
    <>
      <div className="page-topbar">
        <h2 style={{ marginBottom: 0 }}>Plataforma</h2>
      </div>
      <p className="items-count" style={{ marginBottom: 16 }}>
        Empresas cadastradas no sistema (via /signup ou criadas direto no banco). &quot;Últimos 14 dias&quot; conta execuções de checklist: zero é o sinal de empresa esfriando — falar antes de perder.
      </p>

      <div className="data-table">
        <div
          className="data-table-head"
          style={{ gridTemplateColumns: "1fr 160px 100px 120px 140px 120px 140px" }}
        >
          <span>Empresa</span>
          <span>Slug</span>
          <span>Status</span>
          <span>Usuários</span>
          <span>Criada em</span>
          <span>Últimos 14 dias</span>
          <span></span>
        </div>
        {orgs.length === 0 ? (
          <div className="data-table-empty">Nenhuma empresa cadastrada ainda.</div>
        ) : (
          orgs.map((org) => (
            <div
              key={org.id}
              className="data-table-row"
              style={{ gridTemplateColumns: "1fr 160px 100px 120px 140px 120px 140px", cursor: "default" }}
            >
              <span>{org.name}</span>
              <span>{org.slug}</span>
              <span>{STATUS_LABELS[org.status] ?? org.status}</span>
              <span>{org.userCount}</span>
              <span className="data-table-date">
                {new Date(org.createdAt).toLocaleDateString("pt-BR")}
              </span>
              <span style={{ color: (uso.get(org.id)?.ultimos14 ?? 0) === 0 ? "var(--warning-text, #b58900)" : undefined }}>
                {(() => { const u = uso.get(org.id); if (!u) return "sem execução"; const d = u.ultimaExecucao ? new Date(`${u.ultimaExecucao}T00:00:00`).toLocaleDateString("pt-BR") : "—"; return `${u.ultimos14} · última ${d}`; })()}
              </span>
              <span>
                {org.slug !== "kenkyo" && (
                  <OrganizationStatusActions
                    organizationId={org.id}
                    status={org.status as OrganizationStatus}
                  />
                )}
              </span>
            </div>
          ))
        )}
      </div>

      <h3 style={{ margin: "28px 0 8px" }}>Pedidos da página de venda ({pedidos.length})</h3>
      {pedidos.length === 0 ? (
        <p className="items-count">Nenhum pedido ainda.</p>
      ) : (
        pedidos.map((p) => (
          <div key={p.id} className="resumo-linha" style={{ alignItems: "flex-start" }}>
            <span>
              <strong>{p.nome}</strong>{p.empresa ? ` · ${p.empresa}` : ""} · {p.contato}
              {p.mensagem ? <><br /><span style={{ color: "var(--text-muted)" }}>{p.mensagem}</span></> : null}
            </span>
            <span className="rotina-chip">{new Date(p.createdAt).toLocaleDateString("pt-BR")}</span>
          </div>
        ))
      )}
    </>
  );
}

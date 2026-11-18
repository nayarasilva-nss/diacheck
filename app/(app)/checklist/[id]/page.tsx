import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/dal";
import { resolveEffectiveUnitId } from "@/lib/auth/covering-unit";
import { resolveEffectiveJobFunctionId } from "@/lib/auth/gestor-funcao";
import { getChecklistForUser } from "@/lib/data/checklists";
import { ChecklistItemRow } from "../ChecklistItemRow";

export default async function ChecklistDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const checklistTypeId = Number(id);

  const user = await getCurrentUser();
  const viewer = {
    id: user.id,
    profile: user.profile,
    organizationId: user.organizationId!,
    jobFunctionId: await resolveEffectiveJobFunctionId(user),
    unitId: user.unitId,
    effectiveUnitId: await resolveEffectiveUnitId(user),
  };

  const checklist = checklistTypeId
    ? await getChecklistForUser(checklistTypeId, viewer)
    : null;

  if (!checklist) notFound();

  const total = checklist.items.length;
  const done = checklist.items.filter((i) => i.status !== "pending").length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const conforme = checklist.items.filter((i) => i.status === "conforme").length;
  const naoConforme = checklist.items.filter((i) => i.status === "nao-conforme").length;
  const naoSeAplica = checklist.items.filter((i) => i.status === "nao-se-aplica").length;
  const faltam = total - done;
  const lastCompletedAt = checklist.items.reduce<Date | null>((latest, item) => {
    if (!item.completedAt) return latest;
    return !latest || item.completedAt > latest ? item.completedAt : latest;
  }, null);
  const bloqueado = checklist.prerequisitosPendentes.length > 0;

  return (
    <>
      <div className="checklist-top">
        <Link href={`/checklist?type=${checklist.type}`} className="btn-cancel">
          ‹ Voltar
        </Link>
        <div className="checklist-top-count">{done}/{total}</div>
      </div>

      <div className="checklist-block-header">
        <div>
          <h2 style={{ marginBottom: 4 }}>{checklist.name}</h2>
          {checklist.description && <p>{checklist.description}</p>}
          {checklist.assignedUserName && (
            <p className="items-count">
              Atribuído a: {checklist.assignedUserName}
            </p>
          )}
        </div>
      </div>

      {bloqueado && (
        <div
          style={{
            background: "var(--warning-bg)",
            color: "var(--warning-text)",
            borderRadius: 8,
            padding: "10px 14px",
            fontSize: 13.5,
            fontWeight: 600,
            marginBottom: 16,
          }}
        >
          🔒 Termine primeiro: {checklist.prerequisitosPendentes.join(", ")}.
        </div>
      )}

      <div className="checklist-progress">
        <div style={{ width: `${pct}%` }} />
      </div>

      <div className="hoje-layout">
        <div>
          {checklist.items.map((item) => (
            <ChecklistItemRow
              key={item.id}
              item={item}
              checklistTypeId={checklist.id}
              checklistTypeName={checklist.name}
              organizationId={user.organizationId ?? 0}
              locked={bloqueado}
            />
          ))}
          <Link href="/hoje" className={`checklist-finish${total > 0 && done === total ? " pronto" : ""}`}>
            {total > 0 && done === total ? "✓ Checklist concluído · Voltar ao início" : "Continuar depois"}
          </Link>
        </div>

        <div className="hoje-column">
          <div className="today-card">
            <div className="today-card-title" style={{ marginBottom: 14 }}>
              Resumo
            </div>
            <div className="detail-panel-fields" style={{ gap: 10 }}>
              <div className="quick-action-row">
                Feitas
                <span className="badge badge-success">{conforme}</span>
              </div>
              {naoConforme > 0 && (
                <div className="quick-action-row">
                  Não conformes
                  <span className="badge badge-danger">{naoConforme}</span>
                </div>
              )}
              {naoSeAplica > 0 && (
                <div className="quick-action-row">
                  Não se aplica
                  <span className="badge badge-neutral">{naoSeAplica}</span>
                </div>
              )}
              <div className="quick-action-row" style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                Faltam
                <span className="badge badge-info">{faltam}</span>
              </div>
            </div>
          </div>

          <div className="today-card">
            <div className="today-card-subtitle">
              {lastCompletedAt
                ? `Última alteração às ${lastCompletedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}. Você pode fechar e retomar de onde parou.`
                : "Suas respostas são salvas automaticamente a cada item."}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

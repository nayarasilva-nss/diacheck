"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { deleteAnomaly, markAnomalyTreated } from "@/lib/actions/anomalies";
import { ANOMALY_SETORES, ANOMALY_TYPES } from "@/lib/anomaly-constants";
import { UnitFilter } from "../UnitFilter";
import { AnomaliaForm } from "./AnomaliaForm";

type AnomalyRecord = {
  id: number;
  date: string;
  relator: string;
  tipos: string[];
  setores: string[];
  colaboradoresEnvolvidos: string;
  oQueAconteceu: string;
  causaPercebida: string;
  consequenciaImediata: string | null;
  acaoTomada: string | null;
  sugestaoTratativa: string | null;
  status: string;
  sourceChecklistCompletionId: number | null;
  unitName: string | null;
  userName: string;
};

const TYPE_BADGE: Record<string, string> = {
  Comportamental: "badge-violet",
  "Segurança alimentar": "badge-danger",
  "Qualidade do produto": "badge-warning",
  Gerencial: "badge-brand",
  Operacional: "badge-info",
  "Atendimento ao cliente": "badge-neutral",
};

const PERIOD_OPTIONS = [
  { value: "7", label: "7 dias" },
  { value: "30", label: "30 dias" },
  { value: "", label: "Tudo" },
];

function mostFrequent(values: string[]): { value: string; count: number } | null {
  if (values.length === 0) return null;
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: { value: string; count: number } | null = null;
  for (const [value, count] of counts) {
    if (!best || count > best.count) best = { value, count };
  }
  return best;
}

function firstSentence(text: string, max = 60) {
  const cut = text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
  return cut;
}

export function AnomaliasBoard({
  records,
  units,
  canViewAllUnits,
  requestedUnitId,
  tipo,
  setor,
  dias,
  canCreate,
  canDelete,
  defaultRelator,
  unitPickerOptions,
}: {
  records: AnomalyRecord[];
  units: { id: number; name: string }[];
  canViewAllUnits: boolean;
  requestedUnitId: number | null;
  tipo: string | null;
  setor: string | null;
  dias: string | null;
  canCreate: boolean;
  canDelete: boolean;
  defaultRelator: string;
  // Só não-vazio pra quem não tem unidade fixa hoje (Gestor sem
  // "Unidade de hoje") — precisa escolher a unidade ao registrar.
  unitPickerOptions: { id: number; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const selected = records.find((r) => r.id === selectedId) ?? null;

  const summary = useMemo(() => {
    const tipoTop = mostFrequent(records.flatMap((r) => r.tipos));
    const setorTop = mostFrequent(records.flatMap((r) => r.setores));
    const fromChecklist = records.filter((r) => r.sourceChecklistCompletionId !== null).length;
    return { tipoTop, setorTop, fromChecklist };
  }, [records]);

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  function openDetail(id: number) {
    setCreating(false);
    setSelectedId((current) => (current === id ? null : id));
  }

  function openCreate() {
    setSelectedId(null);
    setCreating(true);
  }

  return (
    <>
      <div className="page-topbar">
        <h2 style={{ marginBottom: 0 }}>Anomalias</h2>
        <div style={{ display: "flex", gap: 10 }}>
          <a
            className="btn-secondary"
            style={{ display: "inline-block" }}
            href={`/api/anomalias/export${requestedUnitId ? `?unit=${requestedUnitId}` : ""}`}
          >
            Baixar Excel
          </a>
          {canDelete && (
            <a className="btn-secondary" style={{ display: "inline-block" }} href="/anomalias/analise">
              Análise e planos
            </a>
          )}
          {canCreate && (
            <button type="button" className="btn-primary" onClick={openCreate}>
              Nova anomalia
            </button>
          )}
        </div>
      </div>

      {canViewAllUnits && (
        <div style={{ maxWidth: 280, marginBottom: 16 }}>
          <UnitFilter units={units} value={requestedUnitId} />
        </div>
      )}

      <div className="filter-pills">
        {ANOMALY_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            className={`pill${tipo === t ? " active" : ""}`}
            onClick={() => setParam("tipo", tipo === t ? null : t)}
          >
            {t}
            {tipo === t && " ×"}
          </button>
        ))}
      </div>
      <div className="filter-pills">
        {ANOMALY_SETORES.map((s) => (
          <button
            key={s}
            type="button"
            className={`pill${setor === s ? " active" : ""}`}
            onClick={() => setParam("setor", setor === s ? null : s)}
          >
            {s}
            {setor === s && " ×"}
          </button>
        ))}
      </div>
      <div className="filter-pills">
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`pill${(dias ?? "") === opt.value ? " active" : ""}`}
            onClick={() => setParam("dias", opt.value || null)}
          >
            {opt.label}
          </button>
        ))}
        <span className="pill-count">{records.length} registros</span>
      </div>

      <div className="summary-cards compactos">
        <div className="summary-card">
          <div className="summary-card-label">Tipo mais frequente</div>
          <div className="summary-card-value">{summary.tipoTop?.value ?? "—"}</div>
          {summary.tipoTop && (
            <div className="summary-card-meta">{summary.tipoTop.count} ocorrências</div>
          )}
        </div>
        <div className="summary-card">
          <div className="summary-card-label">Setor crítico</div>
          <div className="summary-card-value">{summary.setorTop?.value ?? "—"}</div>
          {summary.setorTop && (
            <div className="summary-card-meta">{summary.setorTop.count} ocorrências</div>
          )}
        </div>
        <div className="summary-card">
          <div className="summary-card-label">Geradas por checklist</div>
          <div className="summary-card-value">{summary.fromChecklist}</div>
          <div className="summary-card-meta">de {records.length} no total</div>
        </div>
      </div>

      <div className="board-layout">
        <div className="data-table cartoes">
          <div
            className="data-table-head cols-anomalias"
          >
            <span>Data</span>
            <span>Ocorrido</span>
            <span>Setor</span>
            <span>Unidade</span>
            <span>Origem</span>
          </div>
          {records.length === 0 ? (
            <div className="data-table-empty">Nenhuma anomalia reportada ainda</div>
          ) : (
            records.map((record) => (
              <div
                key={record.id}
                className={`data-table-row cols-anomalias${selectedId === record.id ? " selected" : ""}`}
                onClick={() => openDetail(record.id)}
              >
                <span className="data-table-date col-data">
                  {new Date(`${record.date}T00:00:00`).toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                  })}
                </span>
                <span className="col-ocorrido">
                  {record.tipos[0] && (
                    <span className={`badge col-tipo ${TYPE_BADGE[record.tipos[0]] ?? "badge-neutral"}`}>
                      {record.tipos[0]}
                    </span>
                  )}{" "}
                  <span className="col-texto">{firstSentence(record.oQueAconteceu)}</span>
                </span>
                <span className="col-setor">{record.setores[0] ?? "—"}</span>
                <span className="col-unidade">{record.unitName ?? "—"}</span>
                <span className="col-origem">
                  <span className={`badge ${record.sourceChecklistCompletionId ? "badge-info" : "badge-neutral"}`}>
                    {record.sourceChecklistCompletionId ? "Checklist" : "Manual"}
                  </span>
                </span>
              </div>
            ))
          )}
        </div>

        <div className={`detail-panel${creating || selected ? " tela-cheia" : " vazio"}`}>
          {creating ? (
            <>
              <div className="tela-topo">
                <button type="button" className="btn-cancel" onClick={() => setCreating(false)}>
                  Cancelar
                </button>
                <div className="tela-titulo">Nova anomalia</div>
              </div>
              <AnomaliaForm
                defaultRelator={defaultRelator}
                onSuccess={() => setCreating(false)}
                units={unitPickerOptions}
              />
            </>
          ) : selected ? (
            <>
              <div className="detail-panel-header">
                <div>
                  <span className={`badge ${TYPE_BADGE[selected.tipos[0]] ?? "badge-neutral"}`}>
                    {selected.tipos.join(", ")}
                  </span>
                  <div className="detail-panel-title" style={{ marginTop: 8 }}>
                    {firstSentence(selected.oQueAconteceu, 80)}
                  </div>
                  <div className="detail-panel-meta">
                    {new Date(`${selected.date}T00:00:00`).toLocaleDateString("pt-BR")} ·{" "}
                    {selected.setores.join(", ")} · {selected.unitName}
                  </div>
                </div>
                <button
                  type="button"
                  className="detail-panel-close"
                  onClick={() => setSelectedId(null)}
                  aria-label="Fechar"
                >
                  ×
                </button>
              </div>

              {selected.sourceChecklistCompletionId && (
                <div className="detail-panel-origin">
                  🤖 Gerada automaticamente por um item de checklist marcado não conforme.
                </div>
              )}

              <div className="detail-panel-fields">
                <div>
                  <div className="detail-panel-field-label">Relator</div>
                  <div className="detail-panel-field-value">{selected.relator}</div>
                </div>
                <div>
                  <div className="detail-panel-field-label">Colaboradores envolvidos</div>
                  <div className="detail-panel-field-value">
                    {selected.colaboradoresEnvolvidos}
                  </div>
                </div>
                <div>
                  <div className="detail-panel-field-label">O que aconteceu</div>
                  <div className="detail-panel-field-value">{selected.oQueAconteceu}</div>
                </div>
                <div>
                  <div className="detail-panel-field-label">Causa percebida</div>
                  <div className="detail-panel-field-value">{selected.causaPercebida}</div>
                </div>
                {selected.consequenciaImediata && (
                  <div>
                    <div className="detail-panel-field-label">Consequência imediata</div>
                    <div className="detail-panel-field-value">
                      {selected.consequenciaImediata}
                    </div>
                  </div>
                )}
                {selected.acaoTomada && (
                  <div>
                    <div className="detail-panel-field-label">Ação tomada</div>
                    <div className="detail-panel-field-value">{selected.acaoTomada}</div>
                  </div>
                )}
                {selected.sugestaoTratativa && (
                  <div>
                    <div className="detail-panel-field-label">Sugestão de tratativa</div>
                    <div className="detail-panel-field-value detail-panel-field-boxed">
                      {selected.sugestaoTratativa}
                    </div>
                  </div>
                )}
              </div>

              <div className="detail-panel-footer">
                {selected.status === "aberta" ? (
                  <form action={markAnomalyTreated}>
                    <input type="hidden" name="id" value={selected.id} />
                    <button type="submit" className="btn-secondary">
                      Marcar como tratada
                    </button>
                  </form>
                ) : (
                  <span className="badge badge-success">Tratada</span>
                )}
                {canDelete && (
                  <a className="btn-secondary" style={{ display: "inline-block" }} href={`/planos-de-acao/novo?anomalia=${selected.id}`}>
                    Criar plano de ação
                  </a>
                )}
                {canDelete && (
                  <form
                    action={deleteAnomaly}
                    onSubmit={(e) => {
                      if (!confirm("Remover este registro de anomalia?")) e.preventDefault();
                      else setSelectedId(null);
                    }}
                  >
                    <input type="hidden" name="id" value={selected.id} />
                    <button type="submit" className="btn-destructive">
                      Remover
                    </button>
                  </form>
                )}
              </div>
            </>
          ) : (
            <div className="detail-panel-empty">
              Selecione um registro na lista para ver os detalhes.
            </div>
          )}
        </div>
      </div>
    </>
  );
}

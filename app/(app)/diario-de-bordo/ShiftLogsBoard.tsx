"use client";

import { useState } from "react";
import { deleteShiftLog } from "@/lib/actions/shift-logs";
import { LEADER_SELF_ASSESSMENT, SHIFT_STATUS } from "@/lib/shift-log-constants";
import { UnitFilter } from "../UnitFilter";

const STATUS_LABELS = Object.fromEntries(SHIFT_STATUS.map((s) => [s.value, s.label]));
const ASSESSMENT_LABELS = Object.fromEntries(
  LEADER_SELF_ASSESSMENT.map((a) => [a.value, a.label]),
);
const STATUS_BADGE: Record<string, string> = {
  estavel: "badge-success",
  sob_pressao: "badge-warning",
  instavel: "badge-danger",
};

type Pendencia = { descricao: string; responsavel: string | null; prazo: string | null };

type ShiftLogRecord = {
  id: number;
  date: string;
  setor: string;
  statusTurno: string;
  statusJustificativa: string;
  desvioDescricao: string;
  desvioImpacto: string | null;
  desvioCausaRaiz: string | null;
  acoesLideranca: string[];
  acaoLiderancaDescricao: string | null;
  outrasDecisoes: string | null;
  gestaoEquipe: string[];
  gestaoEquipeDescricao: string | null;
  autoavaliacao: string;
  autoavaliacaoMelhorias: string | null;
  unitName: string | null;
  liderNome: string;
  pendencias: Pendencia[];
};

export function ShiftLogsBoard({
  records,
  units,
  canViewAllUnits,
  requestedUnitId,
  canDelete,
}: {
  records: ShiftLogRecord[];
  units: { id: number; name: string }[];
  canViewAllUnits: boolean;
  requestedUnitId: number | null;
  canDelete: boolean;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = records.find((r) => r.id === selectedId) ?? null;

  return (
    <>
      <div className="page-topbar">
        <h2 style={{ marginBottom: 0 }}>Diário de Bordo</h2>
        <a
          className="btn-secondary"
          style={{ display: "inline-block" }}
          href={`/api/diario-de-bordo/export${requestedUnitId ? `?unit=${requestedUnitId}` : ""}`}
        >
          Baixar Excel
        </a>
      </div>

      {canViewAllUnits && (
        <div style={{ maxWidth: 280, marginBottom: 16 }}>
          <UnitFilter units={units} value={requestedUnitId} />
        </div>
      )}

      <div className="board-layout">
        <div className="data-table cartoes">
          <div
            className="data-table-head cols-diario"
          >
            <span>Data</span>
            <span>Principal desvio</span>
            <span>Situação</span>
            <span>Líder</span>
          </div>
          {records.length === 0 ? (
            <div className="data-table-empty">Nenhum diário de bordo registrado ainda</div>
          ) : (
            records.map((record) => (
              <div
                key={record.id}
                className={`data-table-row cols-diario${selectedId === record.id ? " selected" : ""}`}
                onClick={() => setSelectedId((cur) => (cur === record.id ? null : record.id))}
              >
                <span className="data-table-date col-data">
                  {new Date(`${record.date}T00:00:00`).toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                  })}
                </span>
                <span className="col-ocorrido">
                  <span className={`badge col-tipo ${STATUS_BADGE[record.statusTurno] ?? "badge-neutral"}`}>
                    {record.setor}
                  </span>{" "}
                  <span className="col-texto">
                    {record.desvioDescricao.length > 60
                      ? `${record.desvioDescricao.slice(0, 60)}…`
                      : record.desvioDescricao}
                  </span>
                </span>
                <span className="col-setor">{STATUS_LABELS[record.statusTurno] ?? record.statusTurno}</span>
                <span className="col-unidade">{record.liderNome}</span>
              </div>
            ))
          )}
        </div>

        <div className={`detail-panel${selected ? " tela-cheia" : " vazio"}`}>
          {selected ? (
            <>
              <div className="detail-panel-header">
                <div>
                  <span className={`badge ${STATUS_BADGE[selected.statusTurno] ?? "badge-neutral"}`}>
                    {STATUS_LABELS[selected.statusTurno] ?? selected.statusTurno}
                  </span>
                  <div className="detail-panel-title" style={{ marginTop: 8 }}>
                    {selected.setor}
                  </div>
                  <div className="detail-panel-meta">
                    {new Date(`${selected.date}T00:00:00`).toLocaleDateString("pt-BR")} ·{" "}
                    {selected.liderNome} · {selected.unitName}
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

              <div className="detail-panel-fields">
                <div>
                  <div className="detail-panel-field-label">Justificativa da situação</div>
                  <div className="detail-panel-field-value">{selected.statusJustificativa}</div>
                </div>
                <div>
                  <div className="detail-panel-field-label">Principal desvio</div>
                  <div className="detail-panel-field-value">{selected.desvioDescricao}</div>
                </div>
                {selected.desvioImpacto && (
                  <div>
                    <div className="detail-panel-field-label">Impacto</div>
                    <div className="detail-panel-field-value">{selected.desvioImpacto}</div>
                  </div>
                )}
                {selected.desvioCausaRaiz && (
                  <div>
                    <div className="detail-panel-field-label">Causa raiz</div>
                    <div className="detail-panel-field-value">{selected.desvioCausaRaiz}</div>
                  </div>
                )}
                {selected.acoesLideranca.length > 0 && (
                  <div>
                    <div className="detail-panel-field-label">Ação de liderança</div>
                    <div className="detail-panel-field-value">
                      {selected.acoesLideranca.join(", ")}
                    </div>
                  </div>
                )}
                {selected.gestaoEquipe.length > 0 && (
                  <div>
                    <div className="detail-panel-field-label">Gestão da equipe</div>
                    <div className="detail-panel-field-value">
                      {selected.gestaoEquipe.join(", ")}
                    </div>
                  </div>
                )}
                {selected.pendencias.length > 0 && (
                  <div>
                    <div className="detail-panel-field-label">Pendências</div>
                    <div className="detail-panel-field-value">
                      {selected.pendencias.map((p, i) => (
                        <div key={i}>
                          {p.descricao}
                          {p.responsavel ? ` — ${p.responsavel}` : ""}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <div className="detail-panel-field-label">Autoavaliação</div>
                  <div className="detail-panel-field-value">
                    {ASSESSMENT_LABELS[selected.autoavaliacao] ?? selected.autoavaliacao}
                  </div>
                </div>
                {selected.autoavaliacaoMelhorias && (
                  <div>
                    <div className="detail-panel-field-label">Poderia melhorar</div>
                    <div className="detail-panel-field-value detail-panel-field-boxed">
                      {selected.autoavaliacaoMelhorias}
                    </div>
                  </div>
                )}
              </div>

              {canDelete && (
                <div className="detail-panel-footer">
                  <form
                    action={deleteShiftLog}
                    onSubmit={(e) => {
                      if (!confirm("Remover este diário de bordo?")) e.preventDefault();
                      else setSelectedId(null);
                    }}
                  >
                    <input type="hidden" name="id" value={selected.id} />
                    <button type="submit" className="btn-destructive">
                      Remover
                    </button>
                  </form>
                </div>
              )}
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

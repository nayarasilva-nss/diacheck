"use client";

import { useState, useTransition } from "react";
import { cancelSolicitacao, deleteSolicitacao, setItemChegou } from "@/lib/actions/solicitacoes";
import { NovaSolicitacaoForm } from "./NovaSolicitacaoForm";

type SolicitacaoItem = {
  id: number;
  nome: string;
  quantidade: number;
  status: string;
  aprovadoPorId: number | null;
  aprovadoEm: Date | null;
  motivoReprovacao: string | null;
  comprado: boolean;
  dataPrevistaEntrega: string | null;
  chegou: boolean;
};

type Resumo = { label: string; variant: "warning" | "success" | "danger" | "neutral" | "info" };

type Solicitacao = {
  id: number;
  unitId: number;
  unitName: string;
  requesterId: number;
  requesterName: string;
  date: string;
  urgente: boolean;
  observacao: string;
  status: string;
  createdAt: Date;
  erpEnviadaEm: Date | null;
  itens: SolicitacaoItem[];
  resumo: Resumo;
};

const RESUMO_BADGE: Record<Resumo["variant"], string> = {
  warning: "badge-warning",
  success: "badge-success",
  danger: "badge-danger",
  neutral: "badge-neutral",
  info: "badge-info",
};

const ITEM_STATUS_BADGE: Record<string, string> = {
  pendente: "badge-warning",
  aprovado: "badge-success",
  reprovado: "badge-danger",
};

const ITEM_STATUS_LABEL: Record<string, string> = {
  pendente: "Aguardando aprovação",
  aprovado: "Aprovado",
  reprovado: "Reprovado",
};

function formatDate(d: string | Date) {
  return new Date(`${d}`.length === 10 ? `${d}T00:00:00` : d).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Um item: a situação que o ERP diz (aprovação, compra e previsão de entrega — tudo decidido lá, em Compras ›
 * Solicitações) e o ok da chegada, que é daqui.
 */
function ItemRow({
  item,
  solicitacaoId,
  canTrackChegada,
}: {
  item: SolicitacaoItem;
  solicitacaoId: number;
  canTrackChegada: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  function toggleChegou(chegou: boolean) {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("itemId", String(item.id));
      fd.set("solicitacaoId", String(solicitacaoId));
      fd.set("chegou", chegou ? "on" : "off");
      await setItemChegou(fd);
    });
  }

  return (
    <div className="list-item">
      <div className="info">
        <h4>{item.nome}</h4>
        <p>
          Quantidade: {item.quantidade}
          {item.status === "aprovado" && !item.chegou && item.dataPrevistaEntrega && ` · Previsão de chegada: ${formatDate(item.dataPrevistaEntrega)}`}
        </p>
        {item.status === "reprovado" && item.motivoReprovacao && (
          <p>Motivo: {item.motivoReprovacao}</p>
        )}
      </div>
      <div className="list-item-actions" style={{ flexWrap: "wrap", gap: 8 }}>
        {item.status === "aprovado" ? (
          item.chegou ? (
            <span className="badge badge-success">Chegou</span>
          ) : item.comprado ? (
            <span className="badge badge-info">Comprado{item.dataPrevistaEntrega ? "" : " · sem previsão"}</span>
          ) : (
            <span className="badge badge-success">Aprovado · aguardando compra</span>
          )
        ) : (
          <span className={`badge ${ITEM_STATUS_BADGE[item.status] ?? "badge-neutral"}`}>
            {ITEM_STATUS_LABEL[item.status] ?? item.status}
          </span>
        )}

        {canTrackChegada && item.status === "aprovado" && !item.chegou && (
          <button type="button" className="btn-small" disabled={isPending} onClick={() => toggleChegou(true)}>
            Chegou
          </button>
        )}
        {canTrackChegada && item.chegou && (
          <button type="button" className="btn-small" disabled={isPending} onClick={() => toggleChegou(false)}>
            Desfazer
          </button>
        )}
      </div>
    </div>
  );
}

export function SolicitacoesBoard({
  records,
  canCreate,
  canApprove,
  currentUserId,
  units,
}: {
  records: Solicitacao[];
  canCreate: boolean;
  canApprove: boolean;
  currentUserId: number;
  units: { id: number; name: string }[];
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [isDeleting, startDelete] = useTransition();

  const selected = records.find((r) => r.id === selectedId) ?? null;

  function openDetail(id: number) {
    setCreating(false);
    setSelectedId((current) => (current === id ? null : id));
  }

  function handleDelete(id: number) {
    if (!confirm("Excluir esta solicitação definitivamente? Não pode ser desfeito.")) return;
    startDelete(async () => {
      const fd = new FormData();
      fd.set("id", String(id));
      await deleteSolicitacao(fd);
      setSelectedId(null);
    });
  }

  const podeCancel =
    selected &&
    selected.requesterId === currentUserId &&
    selected.status === "aberta" &&
    selected.itens.every((i) => i.status === "pendente");

  return (
    <>
      <div className="page-topbar">
        <h2 style={{ marginBottom: 0 }}>Solicitações</h2>
        {canCreate && (
          <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
            Nova solicitação
          </button>
        )}
      </div>

      <div className="data-table cartoes">
        <div className="data-table-head cols-solicitacoes">
          <span>Data</span>
          <span>Solicitante</span>
          <span>Unidade</span>
          <span>Status</span>
        </div>
        {records.length === 0 ? (
          <div className="data-table-empty">Nenhuma solicitação por aqui.</div>
        ) : (
          records.map((r) => (
            <div
              key={r.id}
              className={`data-table-row cols-solicitacoes${selectedId === r.id ? " selected" : ""}`}
              onClick={() => openDetail(r.id)}
            >
              <span className="data-table-date col-data">{formatDate(r.date)}</span>
              <span className="col-texto">{r.requesterName}</span>
              <span className="col-unidade">{r.unitName}</span>
              <span className="col-tipo">
                {r.urgente && <span className="badge badge-danger">URGENTE</span>}{" "}
                <span className={`badge ${RESUMO_BADGE[r.resumo.variant]}`}>{r.resumo.label}</span>
              </span>
            </div>
          ))
        )}
      </div>

      {selected && (
        <div className="modal-backdrop" onClick={() => setSelectedId(null)}>
          <div className="modal-panel modal-panel-wide" onClick={(e) => e.stopPropagation()}>
            <div className="detail-panel-header">
              <div>
                <span className={`badge ${RESUMO_BADGE[selected.resumo.variant]}`}>{selected.resumo.label}</span>
                <div className="detail-panel-title" style={{ marginTop: 8 }}>
                  Solicitação · {selected.unitName}
                </div>
                <div className="detail-panel-meta">
                  {selected.requesterName} · {formatDate(selected.date)}
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

            <p className="detail-panel-meta" style={{ margin: "0 0 8px" }}>
              {selected.erpEnviadaEm
                ? "A aprovação, a compra e a previsão de chegada são feitas no ERP. Aqui você acompanha e marca quando chegar."
                : "Ainda não foi para o ERP (sem conexão agora): vai sozinha na próxima sincronização."}
            </p>

            {selected.observacao && (
              <div className="detail-panel-fields">
                <div>
                  <div className="detail-panel-field-label">Observação</div>
                  <div className="detail-panel-field-value">{selected.observacao}</div>
                </div>
              </div>
            )}

            <div>
              {selected.itens.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  solicitacaoId={selected.id}
                  canTrackChegada={canApprove || selected.requesterId === currentUserId}
                />
              ))}
            </div>

            {podeCancel && (
              <div className="detail-panel-footer">
                <form
                  action={cancelSolicitacao}
                  onSubmit={(e) => {
                    if (!confirm("Cancelar esta solicitação?")) e.preventDefault();
                    else setSelectedId(null);
                  }}
                >
                  <input type="hidden" name="id" value={selected.id} />
                  <button type="submit" className="btn-destructive">
                    Cancelar solicitação
                  </button>
                </form>
              </div>
            )}

            {canApprove && (
              <div className="detail-panel-footer">
                <button
                  type="button"
                  className="btn-destructive"
                  disabled={isDeleting}
                  onClick={() => handleDelete(selected.id)}
                >
                  Excluir solicitação
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {creating && (
        <div className="modal-backdrop" onClick={() => setCreating(false)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="detail-panel-header">
              <div className="detail-panel-title">Nova solicitação</div>
              <button
                type="button"
                className="detail-panel-close"
                onClick={() => setCreating(false)}
                aria-label="Fechar"
              >
                ×
              </button>
            </div>
            <NovaSolicitacaoForm units={units} onSuccess={() => setCreating(false)} />
          </div>
        </div>
      )}
    </>
  );
}

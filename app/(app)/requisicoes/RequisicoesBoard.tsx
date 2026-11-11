"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  cancelRequisicao,
  conferirRequisicao,
  conferirInternasEmLote,
  deleteRequisicao,
  receberRequisicao,
  updateRequisicaoTipo,
} from "@/lib/actions/requisicoes";
import { nomeArquivoRequisicao } from "@/lib/pdf/nome-arquivo";
import { checklistDayForInstant } from "@/lib/date-utils";
import { NovaRequisicaoForm } from "./NovaRequisicaoForm";
import type { EditingRequisicao } from "./NovaRequisicaoForm";
import { QuantidadeStepper } from "./QuantidadeStepper";

type RequisicaoItem = {
  id: number;
  nome: string;
  unidadeMedida: string;
  qtdPedida: string;
  qtdConferida: string | null;
  qtdRecebida: string | null;
  // externa: "emporio" (o Empório separa) ou "compras" (chega por compra direta)
  destino: string | null;
};

/** A parte que vai por Compras, como está no ERP (solicitação de compra). */
type SituacaoCompras = { numero: string; status: string; pedido: string | null };

const FASE_COMPRAS: Record<string, string> = {
  aberta: "aguardando o comprador",
  em_cotacao: "em cotação",
  pedido_feito: "pedido feito ao fornecedor",
  recebida: "recebida",
  cancelada: "cancelada",
};

const vaiPorCompras = (r: { tipo: string }, item: RequisicaoItem) => r.tipo === "externa" && item.destino === "compras";

type LinkCandidate = { id: number; createdAt: Date; requesterName: string };

type Requisicao = {
  id: number;
  tipo: string;
  unitId: number;
  unitName: string;
  requesterId: number;
  requesterName: string;
  urgente: boolean;
  observacao: string;
  status: string;
  conferidoPorId: number | null;
  relatedRequisicaoId: number | null;
  related: { createdAt: Date; requesterName: string } | null;
  createdAt: Date;
  editedAt: Date | null;
  concluidoEm: Date | null;
  recebidoEm: Date | null;
  recebimentoObs: string | null;
  itens: RequisicaoItem[];
  podeEditar: boolean;
};

const STATUS_BADGE: Record<string, string> = {
  aberta: "badge-warning",
  conferida: "badge-success",
  cancelada: "badge-neutral",
};

const STATUS_LABEL: Record<string, string> = {
  aberta: "Aberta",
  conferida: "Conferida",
  cancelada: "Cancelada",
};

/** Itens que o estoque conferiu com quantidade diferente da pedida. */
function itensAlterados(r: { status: string; itens: RequisicaoItem[] } & { tipo: string }) {
  if (r.status !== "conferida") return [];
  return r.itens.filter(
    (i) => !vaiPorCompras(r, i) && i.qtdConferida !== null && Number(i.qtdConferida) !== Number(i.qtdPedida),
  );
}

function formatDate(d: Date) {
  return new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function ConferirForm({ requisicao, onDone }: { requisicao: Requisicao; onDone: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();
  // o que vai por Compras não passa pelo Empório: só se confere o resto
  const itens = requisicao.itens.filter((item) => !vaiPorCompras(requisicao, item));
  const [qtds, setQtds] = useState<Record<number, number>>(() =>
    Object.fromEntries(itens.map((item) => [item.id, Number(item.qtdPedida)])),
  );

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData();
    fd.set("id", String(requisicao.id));
    for (const [itemId, qtd] of Object.entries(qtds)) {
      fd.set(`qtd-${itemId}`, String(qtd));
    }
    startTransition(async () => {
      const result = await conferirRequisicao(undefined, fd);
      if (result?.error) setError(result.error);
      else onDone();
    });
  }

  const label =
    requisicao.tipo === "interna"
      ? "Confirmar o que saiu do estoque"
      : "Confirmar o que foi entregue";

  return (
    <form onSubmit={handleSubmit}>
      {itens.map((item) => (
        <div className="list-item" key={item.id}>
          <div className="info">
            <h4>{item.nome}</h4>
            <p>Pedido: {item.qtdPedida}{item.unidadeMedida}</p>
          </div>
          <div className="list-item-actions">
            <QuantidadeStepper
              value={qtds[item.id] ?? 0}
              unidade={item.unidadeMedida}
              onChange={(v) => setQtds((prev) => ({ ...prev, [item.id]: v }))}
            />
          </div>
        </div>
      ))}
      {error && <p className="login-error">{error}</p>}
      <div className="inline-form-buttons">
        <button className="btn-save" type="submit" disabled={isPending}>
          {label}
        </button>
      </div>
    </form>
  );
}

function ReceberForm({ requisicao, onDone }: { requisicao: Requisicao; onDone: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const [obs, setObs] = useState("");
  const itens = requisicao.itens.filter((item) => !vaiPorCompras(requisicao, item));
  const [qtds, setQtds] = useState<Record<number, number>>(() =>
    Object.fromEntries(itens.map((item) => [item.id, Number(item.qtdConferida ?? item.qtdPedida)])),
  );

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData();
    fd.set("id", String(requisicao.id));
    fd.set("obs", obs);
    for (const [itemId, qtd] of Object.entries(qtds)) fd.set(`qtd-${itemId}`, String(qtd));
    startTransition(async () => {
      const result = await receberRequisicao(undefined, fd);
      if (result?.error) setError(result.error);
      else onDone();
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="detail-panel-field-label">Recebido pela unidade</div>
      {itens.map((item) => (
        <div className="list-item" key={item.id}>
          <div className="info">
            <h4>{item.nome}</h4>
            <p>Enviado: {item.qtdConferida ?? item.qtdPedida}{item.unidadeMedida}</p>
          </div>
          <div className="list-item-actions">
            <QuantidadeStepper
              value={qtds[item.id] ?? 0}
              unidade={item.unidadeMedida}
              onChange={(v) => setQtds((prev) => ({ ...prev, [item.id]: v }))}
            />
          </div>
        </div>
      ))}
      <textarea
        id={`recebimento-obs-${requisicao.id}`}
        className="form-input"
        placeholder="Observação (ex.: veio menos, item danificado)"
        value={obs}
        onChange={(e) => setObs(e.target.value)}
      />
      {error && <p className="login-error">{error}</p>}
      <div className="inline-form-buttons">
        <button className="btn-save" type="submit" disabled={isPending}>
          Confirmar o que chegou
        </button>
      </div>
    </form>
  );
}

function ConferirEmLote({ units, onDone }: { units: { id: number; name: string }[]; onDone: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [unidade, setUnidade] = useState<number | "">("");
  const [msg, setMsg] = useState<string | undefined>();
  const [ocupado, iniciar] = useTransition();
  function conferir() {
    if (unidade === "") return;
    iniciar(async () => {
      const previa = await conferirInternasEmLote(unidade, false);
      if (previa.error) return setMsg(previa.error);
      if (!previa.total) return setMsg("Nenhuma requisição interna aberta (com itens) nesta unidade.");
      const nome = units.find((u) => u.id === unidade)?.name ?? "";
      if (!confirm(`Conferir ${previa.total} requisição(ões) interna(s) abertas de ${nome}, dando como conferido o que foi pedido? Isso baixa o estoque no ERP e não dá para desfazer em lote.`)) return;
      const r = await conferirInternasEmLote(unidade, true);
      setMsg(r.error ?? `${r.feitas} requisição(ões) conferida(s).`);
      onDone();
    });
  }
  if (!aberto) return <button type="button" className="btn-secondary" onClick={() => setAberto(true)}>Conferir todas as abertas</button>;
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <select value={unidade} onChange={(e) => { setUnidade(e.target.value ? Number(e.target.value) : ""); setMsg(undefined); }} aria-label="Unidade" style={{ width: "auto" }} disabled={ocupado}>
        <option value="">Escolha a unidade</option>
        {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
      </select>
      <button type="button" className="btn-primary" onClick={conferir} disabled={unidade === "" || ocupado}>{ocupado ? "Conferindo…" : "Conferir internas abertas"}</button>
      <button type="button" className="btn-secondary" onClick={() => setAberto(false)} disabled={ocupado}>Fechar</button>
      {msg && <span className="items-count" style={{ margin: 0 }}>{msg}</span>}
    </div>
  );
}

export function RequisicoesBoard({
  records,
  tipo,
  tabs,
  canCreate,
  canConferir,
  currentUserId,
  categorias,
  catalogItems,
  setorFiltro,
  units,
  todayWeekday,
  criarTiposPermitidos,
  linkCandidatesByUnit,
  fixedUnitId,
  extraUnitIds = [],
  isGestor,
  canReceber,
  situacaoCompras,
}: {
  records: Requisicao[];
  tipo: string | null;
  tabs: ("interna" | "externa")[];
  canCreate: boolean;
  canConferir: boolean;
  currentUserId: number;
  categorias: { id: number; name: string; orderDays: number[] }[];
  catalogItems: {
    id: number;
    name: string;
    unitMeasure: string;
    categoryId: number | null;
    categoryName: string | null;
    doSetor: boolean;
  }[];
  setorFiltro: string | null;
  units: { id: number; name: string }[];
  todayWeekday: number;
  criarTiposPermitidos: ("interna" | "externa")[];
  linkCandidatesByUnit: Record<number, { interna: LinkCandidate[]; externa: LinkCandidate[] }>;
  fixedUnitId: number | null;
  extraUnitIds?: number[];
  isGestor: boolean;
  canReceber: boolean;
  situacaoCompras: Record<number, SituacaoCompras>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | undefined>();
  const [isDeleting, startDelete] = useTransition();
  const [tipoError, setTipoError] = useState<string | undefined>();
  const [isChangingTipo, startChangeTipo] = useTransition();

  const [dataDe, setDataDe] = useState("");
  const [dataAte, setDataAte] = useState("");
  const [requesterFiltro, setRequesterFiltro] = useState<number | "">("");
  const [statusFiltro, setStatusFiltro] = useState<string>("");
  const [unitFiltro, setUnitFiltro] = useState<number | "">("");

  const solicitantes = useMemo(() => {
    const map = new Map<number, string>();
    for (const r of records) map.set(r.requesterId, r.requesterName);
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [records]);

  const unidades = useMemo(() => {
    const map = new Map<number, string>();
    for (const r of records) map.set(r.unitId, r.unitName);
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [records]);

  function localDateValue(d: Date) {
    const date = new Date(d);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      if (dataDe && localDateValue(r.createdAt) < dataDe) return false;
      if (dataAte && localDateValue(r.createdAt) > dataAte) return false;
      if (requesterFiltro && r.requesterId !== requesterFiltro) return false;
      if (statusFiltro && r.status !== statusFiltro) return false;
      if (unitFiltro && r.unitId !== unitFiltro) return false;
      return true;
    });
  }, [records, dataDe, dataAte, requesterFiltro, statusFiltro, unitFiltro]);

  const filtrosAtivos =
    dataDe !== "" || dataAte !== "" || requesterFiltro !== "" || statusFiltro !== "" || unitFiltro !== "";

  function limparFiltros() {
    setDataDe("");
    setDataAte("");
    setRequesterFiltro("");
    setStatusFiltro("");
    setUnitFiltro("");
  }

  const selected = records.find((r) => r.id === selectedId) ?? null;
  const editingRecord = records.find((r) => r.id === editingId) ?? null;

  function handleChangeTipo(id: number, tipo: "interna" | "externa") {
    setTipoError(undefined);
    startChangeTipo(async () => {
      const fd = new FormData();
      fd.set("id", String(id));
      fd.set("tipo", tipo);
      const result = await updateRequisicaoTipo(undefined, fd);
      if (result?.error) setTipoError(result.error);
    });
  }

  function handleDelete(id: number) {
    if (!confirm("Excluir esta requisição definitivamente? Isso remove o registro por completo, diferente de cancelar — não pode ser desfeito.")) {
      return;
    }
    setDeleteError(undefined);
    startDelete(async () => {
      const fd = new FormData();
      fd.set("id", String(id));
      const result = await deleteRequisicao(undefined, fd);
      if (result?.error) {
        setDeleteError(result.error);
      } else {
        setSelectedId(null);
      }
    });
  }

  function setTipoParam(value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("tipo", value);
    else params.delete("tipo");
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
        <h2 style={{ marginBottom: 0 }}>Requisições</h2>
        {canCreate && (
          <button type="button" className="btn-primary" onClick={openCreate}>
            Nova requisição
          </button>
        )}
      </div>

      {isGestor && tipo !== "externa" && units.length > 0 && (
        <div style={{ marginBottom: 14 }}><ConferirEmLote units={units} onDone={() => router.refresh()} /></div>
      )}

      {tabs.length > 1 && (
        <div className="filter-pills">
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              className={`pill${(tipo ?? tabs[0]) === t ? " active" : ""}`}
              onClick={() => setTipoParam(t)}
            >
              {t === "interna" ? "Internas" : "Externas"}
            </button>
          ))}
        </div>
      )}

      <div className="req-filters">
        <div className="req-filter-field">
          <label htmlFor="filtroDataDe">De</label>
          <input
            id="filtroDataDe"
            type="date"
            value={dataDe}
            onChange={(e) => setDataDe(e.target.value)}
          />
        </div>
        <div className="req-filter-field">
          <label htmlFor="filtroDataAte">Até</label>
          <input
            id="filtroDataAte"
            type="date"
            value={dataAte}
            onChange={(e) => setDataAte(e.target.value)}
          />
        </div>
        <div className="req-filter-field">
          <label htmlFor="filtroSolicitante">Solicitante</label>
          <select
            id="filtroSolicitante"
            value={requesterFiltro}
            onChange={(e) => setRequesterFiltro(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">Todos</option>
            {solicitantes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="req-filter-field">
          <label htmlFor="filtroStatus">Status</label>
          <select
            id="filtroStatus"
            value={statusFiltro}
            onChange={(e) => setStatusFiltro(e.target.value)}
          >
            <option value="">Todos</option>
            <option value="aberta">Aberta</option>
            <option value="conferida">Conferida</option>
            <option value="cancelada">Cancelada</option>
          </select>
        </div>
        {unidades.length > 1 && (
          <div className="req-filter-field">
            <label htmlFor="filtroUnidade">Unidade</label>
            <select
              id="filtroUnidade"
              value={unitFiltro}
              onChange={(e) => setUnitFiltro(e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">Todas</option>
              {unidades.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {filtrosAtivos && (
          <button type="button" className="btn-tertiary" onClick={limparFiltros}>
            Limpar filtros
          </button>
        )}
      </div>

      <div className="data-table">
        <div className="data-table-head data-table-cols-requisicoes">
          <span className="col-tipo">Tipo</span>
          <span className="col-data">Data</span>
          <span className="col-solicitante">Solicitante</span>
          <span className="col-unidade">Unidade</span>
          <span className="col-status">Status</span>
        </div>
        {filteredRecords.length === 0 ? (
          <div className="data-table-empty">
            {filtrosAtivos ? "Nenhuma requisição encontrada com esses filtros." : "Nenhuma requisição por aqui."}
          </div>
        ) : (
          filteredRecords.map((r) => (
            <div
              key={r.id}
              className={`data-table-row data-table-cols-requisicoes${selectedId === r.id ? " selected" : ""}`}
              onClick={() => openDetail(r.id)}
            >
              <span className="col-tipo">
                <span className={`badge ${r.tipo === "interna" ? "badge-info" : "badge-violet"}`}>
                  {r.tipo === "interna" ? "Interna" : "Externa"}
                </span>
              </span>
              <span className="col-data">{formatDate(r.createdAt)}</span>
              <span className="col-solicitante">{r.requesterName}</span>
              <span className="col-unidade">{r.unitName}</span>
              <span className="col-status">
                {r.urgente && <span className="badge badge-danger">URGENTE</span>}{" "}
                {r.relatedRequisicaoId && (
                  <span className="badge badge-info" title="Excedente de uma requisição já enviada">
                    EXCEDENTE
                  </span>
                )}{" "}
                {r.itens.length > 0 && r.itens.every((i) => vaiPorCompras(r, i)) && r.status === "aberta" ? (
                  <span className="badge badge-info" title="Tudo desta requisição chega por compra direta">
                    Compras · {FASE_COMPRAS[situacaoCompras[r.id]?.status ?? "aberta"]}
                  </span>
                ) : (
                  <>
                    <span className={`badge ${STATUS_BADGE[r.status] ?? "badge-neutral"}`}>
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                    {itensAlterados(r).length > 0 && (
                      <>
                        {" "}
                        <span className="badge badge-warning" title="O estoque conferiu quantidades diferentes das pedidas">
                          Alterada pelo estoque
                        </span>
                      </>
                    )}
                    {r.itens.some((i) => vaiPorCompras(r, i)) && (
                      <>
                        {" "}
                        <span className="badge badge-info" title="Parte desta requisição chega por compra direta">+ Compras</span>
                      </>
                    )}
                  </>
                )}
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
                <span className={`badge ${STATUS_BADGE[selected.status] ?? "badge-neutral"}`}>
                  {STATUS_LABEL[selected.status] ?? selected.status}
                </span>
                <div className="detail-panel-title" style={{ marginTop: 8 }}>
                  Requisição {selected.tipo} · {selected.unitName}
                </div>
                <div className="detail-panel-meta">
                  {selected.requesterName} · {formatDate(selected.createdAt)}
                </div>
                {isGestor && (
                  <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
                    <label htmlFor="tipoOverride" style={{ fontSize: 12, color: "var(--text-faint)" }}>
                      Tipo:
                    </label>
                    <select
                      id="tipoOverride"
                      value={selected.tipo}
                      disabled={isChangingTipo}
                      onChange={(e) => handleChangeTipo(selected.id, e.target.value as "interna" | "externa")}
                      style={{ fontSize: 12.5, padding: "3px 6px" }}
                    >
                      <option value="interna">Interna</option>
                      <option value="externa">Externa</option>
                    </select>
                    {tipoError && (
                      <span style={{ fontSize: 11.5, color: "var(--danger-text)" }}>{tipoError}</span>
                    )}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {/* Plain <a>, not next/link: Link's client-side routing
                    interception doesn't play well with target="_blank"
                    in this Next.js version — clicking it silently did
                    nothing instead of opening the print page. */}
                <a
                  href={`/api/requisicoes/${selected.id}/pdf/${nomeArquivoRequisicao({ tipo: selected.tipo, unitName: selected.unitName, dia: checklistDayForInstant(selected.createdAt) })}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-pdf"
                >
                  📥 PDF
                </a>
                <button
                  type="button"
                  className="detail-panel-close"
                  onClick={() => setSelectedId(null)}
                  aria-label="Fechar"
                >
                  ×
                </button>
              </div>
            </div>

            {selected.related && (
              <div
                className="detail-panel-origin"
                role="button"
                tabIndex={0}
                onClick={() => setSelectedId(selected.relatedRequisicaoId)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setSelectedId(selected.relatedRequisicaoId);
                }}
                style={{ cursor: "pointer" }}
              >
                Excedente da requisição de {selected.related.requesterName} às{" "}
                {formatDate(selected.related.createdAt)} — toque para ver a original
              </div>
            )}

            {selected.observacao && (
              <div className="detail-panel-fields">
                <div>
                  <div className="detail-panel-field-label">Observação</div>
                  <div className="detail-panel-field-value">{selected.observacao}</div>
                </div>
              </div>
            )}

            {selected.tipo === "externa" && selected.itens.some((i) => vaiPorCompras(selected, i)) && (
              <div className="detail-panel-fields">
                <div>
                  <div className="detail-panel-field-label">
                    Vai pra Compras · {FASE_COMPRAS[situacaoCompras[selected.id]?.status ?? "aberta"]}
                    {situacaoCompras[selected.id]?.pedido ? ` (${situacaoCompras[selected.id]!.pedido})` : ""}
                  </div>
                  <div className="detail-panel-field-value">
                    {selected.itens.filter((i) => vaiPorCompras(selected, i)).map((i) => `${i.nome} (${i.qtdPedida}${i.unidadeMedida})`).join(" · ")}
                  </div>
                  <div className="detail-panel-field-label" style={{ marginTop: 6 }}>
                    Chega por compra direta: o comprador cuida no ERP, não sai do Empório.
                  </div>
                </div>
              </div>
            )}

            {selected.tipo === "externa" && selected.itens.some((i) => vaiPorCompras(selected, i)) && (
              <div className="detail-panel-field-label">Vai pro Empório</div>
            )}

            {canConferir && selected.status === "aberta" && selected.itens.every((i) => vaiPorCompras(selected, i)) ? (
              <p className="items-count">Nada para o Empório separar: tudo desta requisição chega por compra direta.</p>
            ) : canConferir && selected.status === "aberta" ? (
              <ConferirForm requisicao={selected} onDone={() => setSelectedId(null)} />
            ) : (
              <div>
                {selected.itens.filter((item) => !vaiPorCompras(selected, item)).map((item) => (
                  <div className="list-item" key={item.id}>
                    <div className="info">
                      <h4>
                        {item.nome}
                        {selected.status === "conferida" && item.qtdConferida !== null && Number(item.qtdConferida) !== Number(item.qtdPedida) && (
                          <>
                            {" "}
                            <span className="badge badge-warning">Alterado</span>
                          </>
                        )}
                      </h4>
                      <p>
                        Pedido: {item.qtdPedida}
                        {item.unidadeMedida}
                        {item.qtdConferida !== null &&
                          ` · Conferido: ${item.qtdConferida}${item.unidadeMedida}`}
                        {item.qtdRecebida !== null &&
                          ` · Recebido: ${item.qtdRecebida}${item.unidadeMedida}`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {selected.tipo === "externa" && selected.status === "conferida" && (
              selected.recebidoEm ? (
                <p className="items-count">
                  Recebido pela unidade em {formatDate(selected.recebidoEm)}
                  {selected.recebimentoObs ? ` — ${selected.recebimentoObs}` : ""}
                </p>
              ) : canReceber && (isGestor || selected.unitId === fixedUnitId || extraUnitIds.includes(selected.unitId)) ? (
                <ReceberForm requisicao={selected} onDone={() => setSelectedId(null)} />
              ) : (
                <p className="items-count">Aguardando a unidade confirmar o recebimento.</p>
              )
            )}

            {selected.requesterId === currentUserId && selected.status === "aberta" && (
              <div className="detail-panel-footer">
                {selected.podeEditar && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setSelectedId(null);
                      setEditingId(selected.id);
                    }}
                  >
                    Editar requisição
                  </button>
                )}
                <form
                  action={cancelRequisicao}
                  onSubmit={(e) => {
                    if (!confirm("Cancelar esta requisição?")) e.preventDefault();
                    else setSelectedId(null);
                  }}
                >
                  <input type="hidden" name="id" value={selected.id} />
                  <button type="submit" className="btn-destructive">
                    Cancelar requisição
                  </button>
                </form>
              </div>
            )}

            {isGestor && (
              <div className="detail-panel-footer" style={{ flexDirection: "column", alignItems: "flex-start" }}>
                {deleteError && <p className="login-error">{deleteError}</p>}
                <button
                  type="button"
                  className="btn-destructive"
                  disabled={isDeleting}
                  onClick={() => handleDelete(selected.id)}
                >
                  {isDeleting ? "Excluindo…" : "Excluir requisição"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {(creating || editingRecord) && (
        <div
          className="modal-backdrop"
          onClick={() => {
            setCreating(false);
            setEditingId(null);
          }}
        >
          <div className="modal-panel tela-cheia-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tela-topo">
              <button
                type="button"
                className="btn-cancel"
                onClick={() => {
                  setCreating(false);
                  setEditingId(null);
                }}
              >
                Cancelar
              </button>
              <div className="tela-titulo">{editingRecord ? "Editar requisição" : "Nova requisição"}</div>
            </div>
            <NovaRequisicaoForm
              tiposPermitidos={criarTiposPermitidos}
              categorias={categorias}
              catalogItems={catalogItems}
              setorFiltro={setorFiltro}
              units={units}
              todayWeekday={todayWeekday}
              linkCandidatesByUnit={editingRecord ? undefined : linkCandidatesByUnit}
              fixedUnitId={fixedUnitId}
              editing={
                editingRecord
                  ? ({
                      id: editingRecord.id,
                      tipo: editingRecord.tipo === "externa" ? "externa" : "interna",
                      urgente: editingRecord.urgente,
                      observacao: editingRecord.observacao,
                      itens: editingRecord.itens.map((item) => ({
                        catalogItemId:
                          catalogItems.find((c) => c.name === item.nome)?.id ?? null,
                        nome: item.nome,
                        unidadeMedida: item.unidadeMedida,
                        qtdPedida: Number(item.qtdPedida),
                      })),
                    } satisfies EditingRequisicao)
                  : undefined
              }
              onSuccess={() => {
                setCreating(false);
                setEditingId(null);
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}

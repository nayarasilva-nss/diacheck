"use client";

import { useMemo, useState } from "react";
import { removerExcecaoEscala } from "@/lib/actions/escala";
import { DeleteButton } from "./DeleteButton";
import { ExcecaoForm, InicioEscalaForm } from "./EscalaForms";

const DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

type Pessoa = { id: number; name: string; unitName: string | null; folgaDias: number[] };
type Excecao = { id: number; date: string; tipo: string; name: string; unitName: string | null };

function dataBr(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const dia = DIAS_SEMANA[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${dia} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

export function EscalaBoard({
  hoje,
  desde,
  pessoas,
  excecoes,
}: {
  hoje: string;
  desde: string | null;
  pessoas: Pessoa[];
  excecoes: Excecao[];
}) {
  const [aba, setAba] = useState<"excecoes" | "folgas">("excecoes");
  const [busca, setBusca] = useState("");
  const [unidade, setUnidade] = useState("");
  const [soSemFolga, setSoSemFolga] = useState(false);
  const [lancando, setLancando] = useState(false);
  const [editandoInicio, setEditandoInicio] = useState(!desde);

  const unidades = useMemo(
    () => [...new Set(pessoas.map((p) => p.unitName).filter((n): n is string => !!n))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [pessoas],
  );
  const q = busca.trim().toLowerCase();
  const casa = (nome: string, un: string | null) =>
    (!q || nome.toLowerCase().includes(q)) && (!unidade || un === unidade);

  const excecoesVisiveis = excecoes.filter((e) => casa(e.name, e.unitName));
  const mapaPorData = new Map<string, Excecao[]>();
  for (const e of excecoesVisiveis) mapaPorData.set(e.date, [...(mapaPorData.get(e.date) ?? []), e]);
  const porData = [...mapaPorData.entries()];

  const pessoasVisiveis = pessoas
    .filter((p) => casa(p.name, p.unitName) && (!soSemFolga || p.folgaDias.length === 0));
  const semFolga = pessoas.filter((p) => p.folgaDias.length === 0).length;
  const filtrando = Boolean(busca || unidade || soSemFolga);

  return (
    <div className="modelos-board">
      <div className="escala-inicio">
        {editandoInicio ? (
          <InicioEscalaForm desde={desde} />
        ) : (
          <p className="items-count">
            A escala vale a partir de <strong>{desde ? dataBr(desde) : "—"}</strong>. Antes disso a folga é no domingo para todos.{" "}
            <button type="button" className="link-btn" onClick={() => setEditandoInicio(true)}>
              Mudar data
            </button>
          </p>
        )}
      </div>

      <div className="modelos-toolbar">
        <input
          id="escalaBusca"
          type="search"
          className="modelos-busca"
          placeholder="Buscar pessoa"
          aria-label="Buscar pessoa"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <select id="escalaUnidade" aria-label="Filtrar por unidade" value={unidade} onChange={(e) => setUnidade(e.target.value)}>
          <option value="">Todas as unidades</option>
          {unidades.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>
        <div className="filter-pills" role="group" aria-label="Ver">
          <button type="button" className={`pill${aba === "excecoes" ? " active" : ""}`} aria-pressed={aba === "excecoes"} onClick={() => setAba("excecoes")}>
            Trocas e folgas · {excecoes.length}
          </button>
          <button type="button" className={`pill${aba === "folgas" ? " active" : ""}`} aria-pressed={aba === "folgas"} onClick={() => setAba("folgas")}>
            Folga fixa · {pessoas.length}
          </button>
        </div>
        <button className="btn-add modelos-novo" type="button" onClick={() => setLancando((v) => !v)}>
          {lancando ? "Fechar" : "+ Lançar folga ou troca"}
        </button>
      </div>

      {lancando && (
        <ExcecaoForm
          pessoas={pessoas.map((p) => ({ id: p.id, name: p.name, unitName: p.unitName }))}
          onDone={() => setLancando(false)}
        />
      )}

      {aba === "excecoes" && (
        <>
          <p className="items-count modelos-resumo">
            {filtrando ? `${excecoesVisiveis.length} de ${excecoes.length} lançamentos` : `${excecoes.length} lançamentos de hoje em diante`}
            {filtrando && (
              <button type="button" className="link-btn" onClick={() => { setBusca(""); setUnidade(""); setSoSemFolga(false); }}>
                Limpar filtros
              </button>
            )}
          </p>
          <p className="items-count">Trocas, rodízio e coberturas. As folgas fixas de cada pessoa ficam na outra visão.</p>

          {porData.length === 0 && (
            <div className="today-card">
              <p className="items-count">{excecoes.length === 0 ? "Nenhuma exceção lançada." : "Nada com esses filtros."}</p>
            </div>
          )}

          {porData.map(([data, lista]) => (
            <section className="modelos-grupo" key={data} aria-label={dataBr(data)}>
              <h3 className="modelos-grupo-titulo">
                {data === hoje ? "Hoje · " : ""}
                {dataBr(data)} <span>{lista.length}</span>
              </h3>
              {lista.map((e) => (
                <div className="modelo-card compacto" key={e.id}>
                  <div className="modelo-card-topo">
                    <div className="modelo-card-titulo static">
                      <span className="modelo-nome">{e.name}</span>
                      <span className={`modelo-badge${e.tipo === "folga" ? "" : " daily"}`}>
                        {e.tipo === "folga" ? "folga" : "trabalha (era folga fixa)"}
                      </span>
                      {e.unitName && <span className="modelo-usuario">{e.unitName}</span>}
                    </div>
                    <div className="list-item-actions">
                      <DeleteButton action={removerExcecaoEscala} id={e.id} confirmText="Remover esta exceção?" />
                    </div>
                  </div>
                </div>
              ))}
            </section>
          ))}
        </>
      )}

      {aba === "folgas" && (
        <>
          <p className="items-count modelos-resumo">
            {pessoasVisiveis.length} {pessoasVisiveis.length === 1 ? "pessoa" : "pessoas"}
            <button type="button" className={`pill${soSemFolga ? " active" : ""}`} aria-pressed={soSemFolga} onClick={() => setSoSemFolga((v) => !v)}>
              Sem folga fixa · {semFolga}
            </button>
          </p>
          <p className="items-count">A folga fixa de cada pessoa se muda em Usuários › Editar.</p>

          {pessoasVisiveis.length === 0 && (
            <div className="today-card">
              <p className="items-count">Ninguém com esses filtros.</p>
            </div>
          )}

          {pessoasVisiveis.map((p) => (
            <div className="modelo-card compacto" key={p.id}>
              <div className="modelo-card-topo">
                <div className="modelo-card-titulo static">
                  <span className="modelo-nome">{p.name}</span>
                  {p.unitName && <span className="modelo-usuario">{p.unitName}</span>}
                </div>
                <div className="escala-semana" aria-label={`Folga de ${p.name}`}>
                  {DIAS_SEMANA.map((d, i) => (
                    <span key={d} className={`escala-dia${p.folgaDias.includes(i) ? " folga" : ""}`}>
                      {d}
                    </span>
                  ))}
                </div>
              </div>
              {p.folgaDias.length === 0 && <div className="modelo-badges sem-recuo"><span className="modelo-badge">sem folga fixa cadastrada</span></div>}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

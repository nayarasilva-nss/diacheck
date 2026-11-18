"use client";

import { useMemo, useState } from "react";
import { JobFunctionRow } from "./JobFunctionRow";
import { UnitRow } from "./UnitRow";
import { AddJobFunctionForm } from "./AddJobFunctionForm";
import { AddUnitForm } from "./AddUnitForm";

type Item = { id: number; name: string; pessoas: number; modelos?: number; noErp?: boolean };

// Lista curta com busca, contagens e cadastro no topo — Funções e Unidades.
export function FuncoesUnidadesBoard({ tipo, itens }: { tipo: "funcao" | "unidade"; itens: Item[] }) {
  const [busca, setBusca] = useState("");
  const [criando, setCriando] = useState(false);
  const plural = tipo === "funcao" ? "funções" : "unidades";

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return itens.filter((i) => !q || i.name.toLowerCase().includes(q));
  }, [itens, busca]);

  return (
    <div className="modelos-board">
      <div className="modelos-toolbar">
        <input
          id={`${tipo}Busca`}
          type="search"
          className="modelos-busca"
          placeholder={`Buscar entre as ${plural}`}
          aria-label={`Buscar entre as ${plural}`}
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <button className="btn-add modelos-novo" type="button" onClick={() => setCriando((v) => !v)}>
          {criando ? "Fechar" : tipo === "funcao" ? "+ Nova função" : "+ Nova unidade"}
        </button>
      </div>

      {criando &&
        (tipo === "funcao" ? (
          <AddJobFunctionForm startOpen onDone={() => setCriando(false)} />
        ) : (
          <AddUnitForm startOpen onDone={() => setCriando(false)} />
        ))}

      <p className="items-count modelos-resumo">
        {busca ? `${lista.length} de ${itens.length} ${plural}` : `${itens.length} ${plural}`}
        {busca && (
          <button type="button" className="link-btn" onClick={() => setBusca("")}>
            Limpar busca
          </button>
        )}
      </p>

      {lista.length === 0 && (
        <div className="today-card">
          <p className="items-count">{itens.length === 0 ? `Nenhuma ${tipo === "funcao" ? "função" : "unidade"} ainda.` : "Nada com essa busca."}</p>
        </div>
      )}

      {lista.map((i) =>
        tipo === "funcao" ? (
          <JobFunctionRow key={i.id} jobFunction={{ id: i.id, name: i.name }} pessoas={i.pessoas} modelos={i.modelos ?? 0} />
        ) : (
          <UnitRow key={i.id} unit={{ id: i.id, name: i.name }} pessoas={i.pessoas} noErp={Boolean(i.noErp)} />
        ),
      )}
    </div>
  );
}

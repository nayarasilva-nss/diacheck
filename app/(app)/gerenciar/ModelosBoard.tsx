"use client";

import { useMemo, useState } from "react";
import { ChecklistTypeRow } from "./ChecklistTypeRow";
import { AddChecklistTypeForm } from "./AddChecklistTypeForm";
import type { EditableItem } from "./ChecklistItemsEditor";

type Option = { id: number; name: string };

export type ModeloChecklist = {
  id: number;
  name: string;
  description: string;
  deadlineTime: string | null;
  type: "daily" | "weekly";
  items: EditableItem[];
  itemCount: number;
  jobFunctionId: number | null;
  jobFunctionName: string | null;
  assignedUserId: number | null;
  assignedUserName: string | null;
  prerequisiteIds: number[];
};

const SEM_FUNCAO = "Todas as funções";

export function ModelosBoard({
  modelos,
  jobFunctions,
  users,
}: {
  modelos: ModeloChecklist[];
  jobFunctions: Option[];
  users: Option[];
}) {
  const [busca, setBusca] = useState("");
  const [funcao, setFuncao] = useState("");
  const [tipo, setTipo] = useState<"" | "daily" | "weekly">("");
  const [criando, setCriando] = useState(false);

  const nomes = useMemo(() => modelos.map((m) => ({ id: m.id, name: m.name })), [modelos]);

  const grupos = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const filtrados = modelos.filter((m) => {
      if (tipo && m.type !== tipo) return false;
      if (funcao === "todas" && m.jobFunctionId !== null) return false;
      if (funcao && funcao !== "todas" && String(m.jobFunctionId) !== funcao) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        m.items.some((i) => i.label.toLowerCase().includes(q))
      );
    });
    const mapa = new Map<string, ModeloChecklist[]>();
    for (const m of filtrados) {
      const chave = m.jobFunctionName ?? SEM_FUNCAO;
      mapa.set(chave, [...(mapa.get(chave) ?? []), m]);
    }
    return {
      total: filtrados.length,
      lista: [...mapa.entries()].sort(([a], [b]) =>
        a === SEM_FUNCAO ? -1 : b === SEM_FUNCAO ? 1 : a.localeCompare(b, "pt-BR"),
      ),
    };
  }, [modelos, busca, funcao, tipo]);

  const filtrando = Boolean(busca || funcao || tipo);

  return (
    <div className="modelos-board">
      <div className="modelos-toolbar">
        <input
          id="modelosBusca"
          type="search"
          className="modelos-busca"
          placeholder="Buscar modelo ou tarefa"
          aria-label="Buscar modelo ou tarefa"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <select
          id="modelosFuncao"
          aria-label="Filtrar por função"
          value={funcao}
          onChange={(e) => setFuncao(e.target.value)}
        >
          <option value="">Todas as funções</option>
          <option value="todas">Só os de toda a equipe</option>
          {jobFunctions.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <div className="filter-pills" role="group" aria-label="Frequência">
          {([["", "Todos"], ["daily", "Diários"], ["weekly", "Semanais"]] as const).map(([k, l]) => (
            <button
              key={k}
              type="button"
              className={`pill${tipo === k ? " active" : ""}`}
              aria-pressed={tipo === k}
              onClick={() => setTipo(k)}
            >
              {l}
            </button>
          ))}
        </div>
        <button className="btn-add modelos-novo" type="button" onClick={() => setCriando((v) => !v)}>
          {criando ? "Fechar" : "+ Novo modelo"}
        </button>
      </div>

      {criando && (
        <AddChecklistTypeForm
          jobFunctions={jobFunctions}
          users={users}
          allChecklistTypes={nomes}
          startOpen
          onDone={() => setCriando(false)}
        />
      )}

      <p className="items-count modelos-resumo">
        {filtrando
          ? `${grupos.total} de ${modelos.length} modelos`
          : `${modelos.length} modelos`}
        {filtrando && (
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              setBusca("");
              setFuncao("");
              setTipo("");
            }}
          >
            Limpar filtros
          </button>
        )}
      </p>

      {grupos.lista.length === 0 && (
        <div className="today-card">
          <p className="items-count">
            {modelos.length === 0
              ? "Nenhum modelo ainda. Crie o primeiro em “+ Novo modelo” ou importe uma planilha acima."
              : "Nenhum modelo com esses filtros."}
          </p>
        </div>
      )}

      {grupos.lista.map(([nome, lista]) => (
        <section className="modelos-grupo" key={nome} aria-label={nome}>
          <h3 className="modelos-grupo-titulo">
            {nome} <span>{lista.length}</span>
          </h3>
          {lista.map((c) => (
            <ChecklistTypeRow
              key={c.id}
              checklistType={c}
              jobFunctions={jobFunctions}
              users={users}
              allChecklistTypes={nomes}
              forceOpen={Boolean(busca) && c.items.some((i) => i.label.toLowerCase().includes(busca.trim().toLowerCase()))}
            />
          ))}
        </section>
      ))}
    </div>
  );
}

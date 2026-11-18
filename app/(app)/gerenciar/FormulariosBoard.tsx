"use client";

import { useMemo, useState } from "react";
import { FormDefinitionRow } from "./FormDefinitionRow";
import { AddFormDefinitionForm } from "./AddFormDefinitionForm";
import type { FormDefinition } from "@/lib/data/form-definitions";

type Option = { id: number; name: string };

export function FormulariosBoard({ definitions, jobFunctions }: { definitions: FormDefinition[]; jobFunctions: Option[] }) {
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState<"" | "ativo" | "inativo">("");
  const [funcao, setFuncao] = useState("");
  const [criando, setCriando] = useState(false);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return definitions.filter((d) => {
      if (situacao === "ativo" && !d.active) return false;
      if (situacao === "inativo" && d.active) return false;
      if (funcao === "gestor" ? !d.allowGestor : funcao && !d.allowedJobFunctionNames.includes(funcao)) return false;
      return (
        !q ||
        d.name.toLowerCase().includes(q) ||
        d.description.toLowerCase().includes(q) ||
        d.fields.some((f) => f.label.toLowerCase().includes(q))
      );
    });
  }, [definitions, busca, situacao, funcao]);

  const filtrando = Boolean(busca || situacao || funcao);

  return (
    <div className="modelos-board">
      <div className="modelos-toolbar">
        <input
          id="formulariosBusca"
          type="search"
          className="modelos-busca"
          placeholder="Buscar formulário ou campo"
          aria-label="Buscar formulário ou campo"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <select id="formulariosFuncao" aria-label="Quem preenche" value={funcao} onChange={(e) => setFuncao(e.target.value)}>
          <option value="">Quem preenche: todos</option>
          <option value="gestor">Gestor</option>
          {jobFunctions.map((f) => (
            <option key={f.id} value={f.name}>{f.name}</option>
          ))}
        </select>
        <div className="filter-pills" role="group" aria-label="Situação">
          {([["", "Todos"], ["ativo", "Ativos"], ["inativo", "Inativos"]] as const).map(([k, l]) => (
            <button key={k} type="button" className={`pill${situacao === k ? " active" : ""}`} aria-pressed={situacao === k} onClick={() => setSituacao(k)}>
              {l}
            </button>
          ))}
        </div>
        <button className="btn-add modelos-novo" type="button" onClick={() => setCriando((v) => !v)}>
          {criando ? "Fechar" : "+ Novo formulário"}
        </button>
      </div>

      {criando && <AddFormDefinitionForm jobFunctions={jobFunctions} startOpen onDone={() => setCriando(false)} />}

      <p className="items-count modelos-resumo">
        {filtrando ? `${lista.length} de ${definitions.length} formulários` : `${definitions.length} formulários`}
        {filtrando && (
          <button type="button" className="link-btn" onClick={() => { setBusca(""); setSituacao(""); setFuncao(""); }}>
            Limpar filtros
          </button>
        )}
      </p>
      <p className="items-count">
        Para registros operacionais que não têm uma tela própria. Aparecem em &quot;Formulários&quot; para quem tiver permissão.
      </p>

      {lista.length === 0 && (
        <div className="today-card">
          <p className="items-count">{definitions.length === 0 ? "Nenhum formulário ainda. Crie o primeiro em “+ Novo formulário”." : "Nenhum formulário com esses filtros."}</p>
        </div>
      )}

      {lista.map((d) => (
        <FormDefinitionRow key={d.id} definition={d} jobFunctions={jobFunctions} />
      ))}
    </div>
  );
}

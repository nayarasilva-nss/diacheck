"use client";

import { useActionState } from "react";
import { atualizarRotina, criarRotina, type RotinaState } from "@/lib/actions/rotinas";

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function RotinaForm({ rotina }: { rotina?: { id: number; nome: string; dias: number[]; lembreteHora: string | null; itens: string[] } }) {
  const [state, action, pending] = useActionState<RotinaState, FormData>(rotina ? atualizarRotina : criarRotina, undefined);
  return (
    <form action={action} className="rotina-form" key={state?.ok ? Date.now() : "f"}>
      {rotina && <input type="hidden" name="id" value={rotina.id} />}
      <div className="form-group">
        <label htmlFor={`nome-${rotina?.id ?? "nova"}`}>Nome da rotina</label>
        <input id={`nome-${rotina?.id ?? "nova"}`} name="nome" defaultValue={rotina?.nome} placeholder="Ex.: Antes de sair" maxLength={120} required />
      </div>
      <div className="form-group">
        <label htmlFor={`itens-${rotina?.id ?? "nova"}`}>Itens (um por linha)</label>
        <textarea id={`itens-${rotina?.id ?? "nova"}`} name="itens" rows={5} defaultValue={rotina?.itens.join("\n")} placeholder={"Conferir o caixa\nFechar a câmara\nDesligar os equipamentos"} required />
      </div>
      <fieldset className="rotina-dias">
        <legend>Dias (nenhum marcado = todos os dias)</legend>
        {DIAS.map((d, i) => (
          <label key={d}>
            <input type="checkbox" name="dias" value={i} defaultChecked={rotina?.dias.includes(i)} /> {d}
          </label>
        ))}
      </fieldset>
      <div className="form-group">
        <label htmlFor={`hora-${rotina?.id ?? "nova"}`}>Lembrete às (opcional)</label>
        <input id={`hora-${rotina?.id ?? "nova"}`} type="time" name="lembreteHora" defaultValue={rotina?.lembreteHora ?? ""} />
      </div>
      {state?.error && <p className="error">{state.error}</p>}
      {state?.ok && <p className="rotina-ok">Salvo.</p>}
      <button className="btn btn-primary" type="submit" disabled={pending}>{rotina ? "Salvar" : "Criar rotina"}</button>
    </form>
  );
}

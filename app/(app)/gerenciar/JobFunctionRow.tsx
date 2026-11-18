"use client";

import { useState, useTransition } from "react";
import { updateJobFunction, deleteJobFunction } from "@/lib/actions/manage";
import { DeleteButton } from "./DeleteButton";

type JobFunction = { id: number; name: string };

export function JobFunctionRow({ jobFunction, pessoas = 0, modelos = 0 }: { jobFunction: JobFunction; pessoas?: number; modelos?: number }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  if (!editing) {
    return (
      <div className="modelo-card">
        <div className="modelo-card-topo">
          <div className="modelo-card-titulo static">
            <span className="modelo-nome">{jobFunction.name}</span>
          </div>
          <div className="list-item-actions">
            <button className="btn-small" type="button" onClick={() => setEditing(true)}>
              Editar
            </button>
            <DeleteButton
              action={deleteJobFunction}
              id={jobFunction.id}
              confirmText={`Deletar a função "${jobFunction.name}"?${pessoas > 0 ? ` ${pessoas} pessoa(s) ficam sem função.` : ""}${modelos > 0 ? ` ${modelos} modelo(s) de checklist deixam de ser específicos dela.` : ""}`}
            />
          </div>
        </div>
        <div className="modelo-badges sem-recuo">
          <span className="modelo-badge">{pessoas} {pessoas === 1 ? "pessoa" : "pessoas"}</span>
          <span className="modelo-badge">{modelos} {modelos === 1 ? "modelo" : "modelos"} de checklist</span>
        </div>
      </div>
    );
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await updateJobFunction(undefined, fd);
      if (result?.error) {
        setError(result.error);
      } else {
        setError(undefined);
        setEditing(false);
      }
    });
  }

  return (
    <form className="inline-form" onSubmit={handleSubmit}>
      <input type="hidden" name="id" value={jobFunction.id} />
      <h4>Editar Função</h4>
      <div className="form-group">
        <label htmlFor={`editJobFunctionName-${jobFunction.id}`}>Nome</label>
        <input
          id={`editJobFunctionName-${jobFunction.id}`}
          name="name"
          defaultValue={jobFunction.name}
        />
      </div>
      {error && <p className="login-error">{error}</p>}
      <div className="inline-form-buttons">
        <button type="button" className="btn-cancel" onClick={() => setEditing(false)}>
          Cancelar
        </button>
        <button className="btn-save" type="submit" disabled={isPending}>
          Salvar
        </button>
      </div>
    </form>
  );
}

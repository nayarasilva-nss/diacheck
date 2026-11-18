"use client";

import { useState, useTransition } from "react";
import { updateUnit, deleteUnit } from "@/lib/actions/manage";
import { DeleteButton } from "./DeleteButton";

export function UnitRow({
  unit,
  pessoas,
  noErp,
}: {
  unit: { id: number; name: string };
  pessoas: number;
  noErp: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  if (!editing) {
    return (
      <div className="modelo-card">
        <div className="modelo-card-topo">
          <div className="modelo-card-titulo static">
            <span className="modelo-nome">{unit.name}</span>
          </div>
          <div className="list-item-actions">
            <button className="btn-small" type="button" onClick={() => setEditing(true)}>
              Renomear
            </button>
            <DeleteButton
              action={deleteUnit}
              id={unit.id}
              confirmText={`Deletar a unidade "${unit.name}"?${pessoas > 0 ? ` ${pessoas} pessoa(s) ficam sem unidade.` : ""} Isso não pode ser desfeito.`}
            />
          </div>
        </div>
        <div className="modelo-badges sem-recuo">
          <span className="modelo-badge">{pessoas} {pessoas === 1 ? "pessoa" : "pessoas"}</span>
          <span className={`modelo-badge${noErp ? " daily" : ""}`}>{noErp ? "ligada ao ERP" : "sem ligação com o ERP"}</span>
        </div>
      </div>
    );
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await updateUnit(undefined, fd);
      if (result?.error) setError(result.error);
      else {
        setError(undefined);
        setEditing(false);
      }
    });
  }

  return (
    <form className="inline-form" onSubmit={handleSubmit}>
      <input type="hidden" name="id" value={unit.id} />
      <h4>Renomear Unidade</h4>
      <div className="form-group">
        <label htmlFor={`editUnitName-${unit.id}`}>Nome</label>
        <input id={`editUnitName-${unit.id}`} name="name" defaultValue={unit.name} />
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

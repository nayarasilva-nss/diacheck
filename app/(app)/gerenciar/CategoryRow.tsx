"use client";

import { useState, useTransition } from "react";
import { updateCategory, deleteCategory } from "@/lib/actions/catalog";
import { DeleteButton } from "./DeleteButton";

const WEEKDAYS = [
  { value: 0, label: "Dom" },
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
];

type Category = { id: number; name: string; orderDays: number[] };

export function CategoryRow({ category }: { category: Category }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  if (!editing) {
    const diasLabel =
      category.orderDays.length > 0
        ? category.orderDays
            .slice()
            .sort((a, b) => a - b)
            .map((d) => WEEKDAYS[d].label)
            .join(", ")
        : "Sem dia de pedido definido";

    return (
      <div className="modelo-card compacto">
        <div className="modelo-card-topo">
          <div className="modelo-card-titulo static">
            <span className="modelo-nome">{category.name}</span>
            <span className="modelo-badge">{category.orderDays.length > 0 ? `pede: ${diasLabel}` : "sem dia de pedido"}</span>
          </div>
          <div className="list-item-actions">
            <button className="btn-small" type="button" onClick={() => setEditing(true)}>
              Editar
            </button>
            <DeleteButton
              action={deleteCategory}
              id={category.id}
              confirmText={`Deletar a categoria "${category.name}"? Os produtos dela ficam sem categoria.`}
            />
          </div>
        </div>
      </div>
    );
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await updateCategory(undefined, fd);
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
      <input type="hidden" name="id" value={category.id} />
      <h4>Editar Categoria</h4>
      <div className="form-group">
        <label htmlFor={`editCategoryName-${category.id}`}>Nome</label>
        <input
          id={`editCategoryName-${category.id}`}
          name="name"
          defaultValue={category.name}
        />
      </div>
      <div className="form-group">
        <label>Dia de pedido (fornecedor)</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {WEEKDAYS.map((d) => (
            <label
              key={d.value}
              className="item-editor-checkbox"
              style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
            >
              <input
                type="checkbox"
                name="orderDays"
                value={d.value}
                defaultChecked={category.orderDays.includes(d.value)}
              />
              {d.label}
            </label>
          ))}
        </div>
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

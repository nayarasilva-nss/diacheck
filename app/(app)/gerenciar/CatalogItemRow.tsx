"use client";

import { useState, useTransition } from "react";
import { updateCatalogItem, deleteCatalogItem } from "@/lib/actions/catalog";
import { DeleteButton } from "./DeleteButton";

const UNIT_MEASURES = ["kg", "g", "un", "L", "ml", "cx", "pct"] as const;

type CatalogItem = {
  id: number;
  name: string;
  unitMeasure: string;
  categoryId: number | null;
  categoryName: string | null;
};

export function CatalogItemRow({
  item,
  categories,
}: {
  item: CatalogItem;
  categories: { id: number; name: string }[];
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  if (!editing) {
    return (
      <div className="modelo-card compacto">
        <div className="modelo-card-topo">
          <div className="modelo-card-titulo static">
            <span className="modelo-nome">{item.name}</span>
            <span className="modelo-badge">{item.unitMeasure}</span>
          </div>
          <div className="list-item-actions">
            <button className="btn-small" type="button" onClick={() => setEditing(true)}>
              Editar
            </button>
            <DeleteButton action={deleteCatalogItem} id={item.id} confirmText={`Deletar o produto "${item.name}"?`} />
          </div>
        </div>
      </div>
    );
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await updateCatalogItem(undefined, fd);
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
      <input type="hidden" name="id" value={item.id} />
      <h4>Editar Produto</h4>
      <div className="form-group">
        <label htmlFor={`editItemName-${item.id}`}>Nome</label>
        <input id={`editItemName-${item.id}`} name="name" defaultValue={item.name} />
      </div>
      <div className="form-group">
        <label htmlFor={`editItemCategory-${item.id}`}>Categoria</label>
        <select
          id={`editItemCategory-${item.id}`}
          name="categoryId"
          defaultValue={item.categoryId ?? ""}
        >
          <option value="">Sem categoria</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <label htmlFor={`editItemUnit-${item.id}`}>Unidade de medida</label>
        <select id={`editItemUnit-${item.id}`} name="unitMeasure" defaultValue={item.unitMeasure}>
          {UNIT_MEASURES.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
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

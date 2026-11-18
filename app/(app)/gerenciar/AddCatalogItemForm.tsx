"use client";

import { useRef, useState, useTransition } from "react";
import { createCatalogItem } from "@/lib/actions/catalog";

const UNIT_MEASURES = ["kg", "g", "un", "L", "ml", "cx", "pct"] as const;

export function AddCatalogItemForm({
  categories,
  startOpen = false,
  onDone,
}: {
  startOpen?: boolean;
  onDone?: () => void;
  categories: { id: number; name: string }[];
}) {
  const [open, setOpen] = useState(startOpen);
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  if (!open) {
    return (
      <button className="btn-add" type="button" onClick={() => setOpen(true)}>
        + Adicionar Produto
      </button>
    );
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await createCatalogItem(undefined, fd);
      if (result?.error) {
        setError(result.error);
      } else {
        setError(undefined);
        setOpen(false);
        formRef.current?.reset();
        onDone?.();
      }
    });
  }

  return (
    <form className="inline-form" ref={formRef} onSubmit={handleSubmit}>
      <h4>Adicionar Produto</h4>
      <div className="form-group">
        <label htmlFor="newItemName">Nome</label>
        <input id="newItemName" name="name" placeholder="Ex: Salmão" />
      </div>
      <div className="form-group">
        <label htmlFor="newItemCategory">Categoria</label>
        <select id="newItemCategory" name="categoryId" defaultValue="">
          <option value="">Sem categoria</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <label htmlFor="newItemUnit">Unidade de medida</label>
        <select id="newItemUnit" name="unitMeasure" defaultValue="un">
          {UNIT_MEASURES.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="login-error">{error}</p>}
      <div className="inline-form-buttons">
        <button type="button" className="btn-cancel" onClick={() => { setOpen(false); onDone?.(); }}>
          Cancelar
        </button>
        <button className="btn-save" type="submit" disabled={isPending}>
          Salvar
        </button>
      </div>
    </form>
  );
}

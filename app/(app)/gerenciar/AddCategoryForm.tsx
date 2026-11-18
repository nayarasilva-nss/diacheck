"use client";

import { useRef, useState, useTransition } from "react";
import { createCategory } from "@/lib/actions/catalog";

export function AddCategoryForm({ startOpen = false, onDone }: { startOpen?: boolean; onDone?: () => void }) {
  const [open, setOpen] = useState(startOpen);
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  if (!open) {
    return (
      <button className="btn-add" type="button" onClick={() => setOpen(true)}>
        + Adicionar Categoria
      </button>
    );
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await createCategory(undefined, fd);
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
      <h4>Adicionar Categoria</h4>
      <div className="form-group">
        <label htmlFor="newCategoryName">Nome</label>
        <input id="newCategoryName" name="name" placeholder="Ex: Hortifruti" />
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

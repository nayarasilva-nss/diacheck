"use client";

import { useRef, useState, useTransition } from "react";
import { createFormDefinition } from "@/lib/actions/form-definitions";
import { FormFieldsEditor } from "./FormFieldsEditor";

type Option = { id: number; name: string };

export function AddFormDefinitionForm({ jobFunctions, startOpen = false, onDone }: { jobFunctions: Option[]; startOpen?: boolean; onDone?: () => void }) {
  const [open, setOpen] = useState(startOpen);
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  if (!open) {
    return (
      <button className="btn-add" type="button" onClick={() => setOpen(true)}>
        + Criar Formulário
      </button>
    );
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await createFormDefinition(undefined, fd);
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
      <h4>Criar Formulário Personalizado</h4>
      <div className="form-group">
        <label htmlFor="newFormName">Nome</label>
        <input id="newFormName" name="name" placeholder="Ex: Temperatura de câmara fria" />
      </div>
      <div className="form-group">
        <label htmlFor="newFormDesc">Descrição (opcional)</label>
        <input id="newFormDesc" name="description" placeholder="Aparece pra quem preenche" />
      </div>

      <FormFieldsEditor name="fieldsJson" initialFields={[]} />

      <div className="form-group">
        <label>Quem pode preencher</label>
        <div className="item-editor-row item-editor-checkbox">
          <input type="checkbox" name="allowGestor" id="newFormAllowGestor" defaultChecked />
          <label htmlFor="newFormAllowGestor">Gestor</label>
        </div>
        {jobFunctions.map((f) => (
          <div className="item-editor-row item-editor-checkbox" key={f.id}>
            <input type="checkbox" name="allowedJobFunctionNames" value={f.name} id={`newFormJf-${f.id}`} />
            <label htmlFor={`newFormJf-${f.id}`}>{f.name}</label>
          </div>
        ))}
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

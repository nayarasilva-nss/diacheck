"use client";

import { useState, useTransition } from "react";
import { updateFormDefinition, deleteFormDefinition, duplicateFormDefinition } from "@/lib/actions/form-definitions";
import { DeleteButton } from "./DeleteButton";
import { FormFieldsEditor, type EditableField } from "./FormFieldsEditor";
import type { FormDefinition } from "@/lib/data/form-definitions";

type Option = { id: number; name: string };

export function FormDefinitionRow({
  definition,
  jobFunctions,
}: {
  definition: FormDefinition;
  jobFunctions: Option[];
}) {
  const [editing, setEditing] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  if (!editing) {
    const TIPOS: Record<string, string> = { number: "número", text: "texto", date: "data", boolean: "sim/não", select: "lista" };
    return (
      <div className="modelo-card">
        <div className="modelo-card-topo">
          <button type="button" className="modelo-card-titulo" aria-expanded={aberto} onClick={() => setAberto((v) => !v)}>
            <span className="modelo-seta" aria-hidden="true">{aberto ? "▾" : "▸"}</span>
            <span className="modelo-nome">{definition.name}</span>
          </button>
          <div className="list-item-actions">
            <button className="btn-small" type="button" onClick={() => setEditing(true)}>
              Editar
            </button>
            <form action={duplicateFormDefinition}>
              <input type="hidden" name="id" value={definition.id} />
              <button className="btn-small" type="submit" title="Cria uma cópia inativa para ajustar">
                Duplicar
              </button>
            </form>
            <DeleteButton
              action={deleteFormDefinition}
              id={definition.id}
              confirmText={`Excluir o formulário "${definition.name}"? Isso apaga os registros já feitos com ele.`}
            />
          </div>
        </div>
        <div className="modelo-badges">
          <span className={`modelo-badge${definition.active ? " daily" : ""}`}>{definition.active ? "Ativo" : "Inativo"}</span>
          <span className="modelo-badge">{definition.fields.length} campos</span>
          {definition.allowGestor && <span className="modelo-badge">gestor</span>}
          {definition.allowedJobFunctionNames.map((n) => (
            <span className="modelo-badge" key={n}>{n}</span>
          ))}
        </div>
        {aberto && (
          <div className="modelo-detalhe">
            {definition.description && <p className="items-count">{definition.description}</p>}
            <ol className="modelo-tarefas">
              {definition.fields.map((f) => (
                <li key={f.key}>
                  {f.label}
                  <em> · {TIPOS[f.type] ?? f.type}{f.unit ? ` (${f.unit})` : ""}{f.required ? " · obrigatório" : ""}</em>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    );
  }

  const initialFields: EditableField[] = definition.fields.map((f) => ({
    label: f.label,
    type: f.type,
    required: f.required,
    decimals: f.decimals ?? 0,
    unit: f.unit ?? "",
    options: (f.options ?? []).join(", "),
  }));

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await updateFormDefinition(undefined, fd);
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
      <input type="hidden" name="id" value={definition.id} />
      <h4>Editar Formulário</h4>
      <div className="form-group">
        <label htmlFor={`editFormName-${definition.id}`}>Nome</label>
        <input id={`editFormName-${definition.id}`} name="name" defaultValue={definition.name} />
      </div>
      <div className="form-group">
        <label htmlFor={`editFormDesc-${definition.id}`}>Descrição (opcional)</label>
        <input id={`editFormDesc-${definition.id}`} name="description" defaultValue={definition.description} />
      </div>

      <FormFieldsEditor name="fieldsJson" initialFields={initialFields} />

      <div className="form-group">
        <label>Quem pode preencher</label>
        <div className="item-editor-row item-editor-checkbox">
          <input
            type="checkbox"
            name="allowGestor"
            id={`editFormAllowGestor-${definition.id}`}
            defaultChecked={definition.allowGestor}
          />
          <label htmlFor={`editFormAllowGestor-${definition.id}`}>Gestor</label>
        </div>
        {jobFunctions.map((f) => (
          <div className="item-editor-row item-editor-checkbox" key={f.id}>
            <input
              type="checkbox"
              name="allowedJobFunctionNames"
              value={f.name}
              id={`editFormJf-${definition.id}-${f.id}`}
              defaultChecked={definition.allowedJobFunctionNames.includes(f.name)}
            />
            <label htmlFor={`editFormJf-${definition.id}-${f.id}`}>{f.name}</label>
          </div>
        ))}
      </div>

      <div className="form-group">
        <label htmlFor={`editFormActive-${definition.id}`}>
          <input
            type="checkbox"
            name="active"
            id={`editFormActive-${definition.id}`}
            defaultChecked={definition.active}
            style={{ marginRight: 6 }}
          />
          Ativo (aparece em Formulários pra quem pode preencher)
        </label>
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

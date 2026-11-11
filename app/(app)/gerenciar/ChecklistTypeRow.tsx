"use client";

import { useState, useTransition } from "react";
import { updateChecklistType, deleteChecklistType, duplicateChecklistType } from "@/lib/actions/manage";
import { DeleteButton } from "./DeleteButton";
import { ChecklistItemsEditor, type EditableItem } from "./ChecklistItemsEditor";

const TYPE_LABELS = { daily: "Diário", weekly: "Semanal" } as const;

type Option = { id: number; name: string };

type ChecklistType = {
  id: number;
  name: string;
  description: string;
  deadlineTime: string | null;
  type: "daily" | "weekly";
  items: EditableItem[];
  itemCount: number;
  jobFunctionId: number | null;
  jobFunctionName: string | null;
  assignedUserId: number | null;
  assignedUserName: string | null;
  prerequisiteIds: number[];
};

export function ChecklistTypeRow({
  checklistType,
  jobFunctions,
  users,
  allChecklistTypes,
  forceOpen = false,
}: {
  checklistType: ChecklistType;
  jobFunctions: Option[];
  users: Option[];
  allChecklistTypes: Option[];
  forceOpen?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  if (!editing) {
    const mostrar = aberto || forceOpen;
    const pre = allChecklistTypes.filter((c) => checklistType.prerequisiteIds.includes(c.id));
    const fotos = checklistType.items.filter((i) => i.requiresPhoto).length;
    return (
      <div className="modelo-card">
        <div className="modelo-card-topo">
          <button
            type="button"
            className="modelo-card-titulo"
            aria-expanded={mostrar}
            onClick={() => setAberto((v) => !v)}
          >
            <span className="modelo-seta" aria-hidden="true">{mostrar ? "▾" : "▸"}</span>
            <span className="modelo-nome">{checklistType.name}</span>
          </button>
          <div className="list-item-actions">
            <button className="btn-small" type="button" onClick={() => setEditing(true)}>
              Editar
            </button>
            <form action={duplicateChecklistType}>
              <input type="hidden" name="id" value={checklistType.id} />
              <button className="btn-small" type="submit" title="Cria uma cópia para ajustar">
                Duplicar
              </button>
            </form>
            <DeleteButton
              action={deleteChecklistType}
              id={checklistType.id}
              confirmText={`Deletar o modelo "${checklistType.name}"?`}
            />
          </div>
        </div>
        <div className="modelo-badges">
          <span className={`modelo-badge ${checklistType.type}`}>{TYPE_LABELS[checklistType.type]}</span>
          <span className="modelo-badge">{checklistType.itemCount} tarefas</span>
          {fotos > 0 && <span className="modelo-badge">{fotos} com foto</span>}
          {checklistType.deadlineTime && <span className="modelo-badge">até {checklistType.deadlineTime.slice(0, 5)}</span>}
          {checklistType.assignedUserName && <span className="modelo-badge">só {checklistType.assignedUserName}</span>}
          {pre.length > 0 && <span className="modelo-badge">depois de {pre.map((p) => p.name).join(", ")}</span>}
        </div>
        {mostrar && (
          <div className="modelo-detalhe">
            {checklistType.description && <p className="items-count">{checklistType.description}</p>}
            <ol className="modelo-tarefas">
              {checklistType.items.map((i, n) => (
                <li key={n}>
                  {i.label}
                  {i.requiresPhoto && <em> · foto</em>}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    );
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await updateChecklistType(undefined, fd);
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
      <input type="hidden" name="id" value={checklistType.id} />
      <h4>Editar Modelo de Checklist</h4>
      <div className="form-group">
        <label htmlFor={`editChecklistName-${checklistType.id}`}>Nome</label>
        <input
          id={`editChecklistName-${checklistType.id}`}
          name="name"
          defaultValue={checklistType.name}
        />
      </div>
      <div className="form-group">
        <label htmlFor={`editChecklistDesc-${checklistType.id}`}>
          Descrição
        </label>
        <input
          id={`editChecklistDesc-${checklistType.id}`}
          name="description"
          defaultValue={checklistType.description}
        />
      </div>
      <div className="form-group">
        <label htmlFor={`editChecklistDeadline-${checklistType.id}`}>Horário-limite (opcional)</label>
        <input
          id={`editChecklistDeadline-${checklistType.id}`}
          name="deadlineTime"
          type="time"
          defaultValue={checklistType.deadlineTime ?? ""}
        />
      </div>
      <div className="form-group">
        <label htmlFor={`editChecklistType-${checklistType.id}`}>Tipo</label>
        <select
          id={`editChecklistType-${checklistType.id}`}
          name="type"
          defaultValue={checklistType.type}
        >
          <option value="daily">Diário</option>
          <option value="weekly">Semanal</option>
        </select>
      </div>
      <div className="form-group">
        <label htmlFor={`editChecklistJobFunction-${checklistType.id}`}>
          Função (opcional)
        </label>
        <select
          id={`editChecklistJobFunction-${checklistType.id}`}
          name="jobFunctionId"
          defaultValue={checklistType.jobFunctionId ?? ""}
        >
          <option value="">Todas as funções</option>
          {jobFunctions.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <label htmlFor={`editChecklistAssignedUser-${checklistType.id}`}>
          Atribuir a (opcional)
        </label>
        <select
          id={`editChecklistAssignedUser-${checklistType.id}`}
          name="assignedUserId"
          defaultValue={checklistType.assignedUserId ?? ""}
        >
          <option value="">Todos da função</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </div>
      {allChecklistTypes.filter((c) => c.id !== checklistType.id).length > 0 && (
        <div className="form-group">
          <label>Pré-requisitos (opcional)</label>
          <p className="items-count" style={{ marginBottom: 8 }}>
            Esse checklist só libera depois que os selecionados abaixo estiverem 100% respondidos no dia.
          </p>
          {allChecklistTypes
            .filter((c) => c.id !== checklistType.id)
            .map((c) => (
              <div className="item-editor-row item-editor-checkbox" key={c.id}>
                <input
                  type="checkbox"
                  name="prerequisiteIds"
                  value={c.id}
                  id={`editChecklistPrereq-${checklistType.id}-${c.id}`}
                  defaultChecked={checklistType.prerequisiteIds.includes(c.id)}
                />
                <label htmlFor={`editChecklistPrereq-${checklistType.id}-${c.id}`}>{c.name}</label>
              </div>
            ))}
        </div>
      )}
      <ChecklistItemsEditor name="itemsJson" initialItems={checklistType.items} />
      {error && <p className="login-error">{error}</p>}
      <div className="inline-form-buttons">
        <button
          type="button"
          className="btn-cancel"
          onClick={() => setEditing(false)}
        >
          Cancelar
        </button>
        <button className="btn-save" type="submit" disabled={isPending}>
          Salvar
        </button>
      </div>
    </form>
  );
}

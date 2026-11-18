"use client";

import { useState, useTransition } from "react";
import { salvarPersonalizacao, removerColaboradorDoModelo } from "@/lib/actions/manage";
import { ChecklistItemsEditor, type EditableItem } from "./ChecklistItemsEditor";

type Option = { id: number; name: string };
export type Personalizacao = {
  userId: number;
  userName: string;
  hiddenItemIds: number[];
  extras: EditableItem[];
};

// Versão do modelo para um colaborador: o modelo base continua valendo (e
// qualquer mudança nele chega aqui); o colaborador pode deixar de receber
// algumas tarefas e ter tarefas só dele.
export function PersonalizacaoPainel({
  checklistTypeId,
  items,
  personalizacoes,
  users,
}: {
  checklistTypeId: number;
  items: (EditableItem & { id?: number })[];
  personalizacoes: Personalizacao[];
  users: Option[];
}) {
  const [editando, setEditando] = useState<number | null>(null);
  const [novo, setNovo] = useState("");
  const disponiveis = users.filter((u) => !personalizacoes.some((p) => p.userId === u.id));

  const alvo = editando
    ? (personalizacoes.find((p) => p.userId === editando) ?? {
        userId: editando,
        userName: users.find((u) => u.id === editando)?.name ?? "",
        hiddenItemIds: [],
        extras: [],
      })
    : null;

  return (
    <div className="modelo-versoes">
      <h5>Versões por colaborador</h5>
      <p className="items-count">
        O modelo vale para a função. Aqui você entrega este mesmo modelo a um colaborador e ajusta só para ele: tira tarefas ou
        acrescenta as dele. Mudou o modelo? A versão dele acompanha.
      </p>

      {personalizacoes.map((p) => (
        <div className="modelo-versao" key={p.userId}>
          <span className="modelo-versao-nome">{p.userName}</span>
          <span className="modelo-badge">
            {p.hiddenItemIds.length > 0 ? `sem ${p.hiddenItemIds.length}` : "tudo do modelo"}
            {p.extras.length > 0 ? ` · +${p.extras.length} dele` : ""}
          </span>
          <button type="button" className="btn-small" onClick={() => setEditando(p.userId)}>
            Personalizar
          </button>
          <RemoverBotao checklistTypeId={checklistTypeId} userId={p.userId} nome={p.userName} />
        </div>
      ))}

      {!editando && (
        <div className="modelo-versao-novo">
          <select
            id={`novoColab-${checklistTypeId}`}
            aria-label="Colaborador"
            value={novo}
            onChange={(e) => setNovo(e.target.value)}
          >
            <option value="">Entregar a um colaborador…</option>
            {disponiveis.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <button type="button" className="btn-small" disabled={!novo} onClick={() => setEditando(Number(novo))}>
            Personalizar
          </button>
        </div>
      )}

      {alvo && (
        <EditorVersao
          key={alvo.userId}
          checklistTypeId={checklistTypeId}
          items={items}
          alvo={alvo}
          onClose={() => {
            setEditando(null);
            setNovo("");
          }}
        />
      )}
    </div>
  );
}

function EditorVersao({
  checklistTypeId,
  items,
  alvo,
  onClose,
}: {
  checklistTypeId: number;
  items: (EditableItem & { id?: number })[];
  alvo: Personalizacao;
  onClose: () => void;
}) {
  const [escondidas, setEscondidas] = useState<Set<number>>(new Set(alvo.hiddenItemIds));
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    for (const id of escondidas) fd.append("hiddenItemIds", String(id));
    startTransition(async () => {
      const r = await salvarPersonalizacao(undefined, fd);
      if (r?.error) setError(r.error);
      else onClose();
    });
  }

  return (
    <form className="inline-form" onSubmit={submit}>
      <input type="hidden" name="checklistTypeId" value={checklistTypeId} />
      <input type="hidden" name="userId" value={alvo.userId} />
      <h4>Versão de {alvo.userName}</h4>
      <div className="form-group">
        <label>Tarefas do modelo que ele recebe</label>
        {items.map((i) => (
          <div className="item-editor-row item-editor-checkbox" key={i.id}>
            <input
              type="checkbox"
              id={`recebe-${checklistTypeId}-${alvo.userId}-${i.id}`}
              checked={i.id !== undefined && !escondidas.has(i.id)}
              onChange={(e) => {
                if (i.id === undefined) return;
                setEscondidas((prev) => {
                  const n = new Set(prev);
                  if (e.target.checked) n.delete(i.id!);
                  else n.add(i.id!);
                  return n;
                });
              }}
            />
            <label htmlFor={`recebe-${checklistTypeId}-${alvo.userId}-${i.id}`}>{i.label}</label>
          </div>
        ))}
      </div>
      <ChecklistItemsEditor name="itemsJson" initialItems={alvo.extras} titulo="Tarefas só dele (extras)" />
      {error && <p className="login-error">{error}</p>}
      <div className="inline-form-buttons">
        <button type="button" className="btn-cancel" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn-save" type="submit" disabled={isPending}>
          Salvar versão
        </button>
      </div>
    </form>
  );
}

function RemoverBotao({ checklistTypeId, userId, nome }: { checklistTypeId: number; userId: number; nome: string }) {
  return (
    <form action={removerColaboradorDoModelo}>
      <input type="hidden" name="checklistTypeId" value={checklistTypeId} />
      <input type="hidden" name="userId" value={userId} />
      <button
        type="submit"
        className="btn-small btn-delete"
        onClick={(e) => {
          if (!confirm(`Tirar este modelo de ${nome}? A versão dele fica guardada.`)) e.preventDefault();
        }}
      >
        Tirar
      </button>
    </form>
  );
}

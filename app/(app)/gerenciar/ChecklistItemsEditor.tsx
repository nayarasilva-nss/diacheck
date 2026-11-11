"use client";

import { useState } from "react";

export type EditableItem = { label: string; requiresPhoto: boolean };

export function ChecklistItemsEditor({
  name,
  initialItems,
}: {
  name: string;
  initialItems: EditableItem[];
}) {
  const [items, setItems] = useState<EditableItem[]>(
    initialItems.length > 0
      ? initialItems
      : [{ label: "", requiresPhoto: false }],
  );

  function updateItem(index: number, patch: Partial<EditableItem>) {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  const [colando, setColando] = useState(false);
  const [texto, setTexto] = useState("");

  function aplicarLista() {
    const novas = texto
      .split(/\r?\n/)
      .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
      .filter(Boolean)
      .map((label) => ({ label, requiresPhoto: false }));
    if (novas.length > 0) {
      setItems((prev) => [...prev.filter((i) => i.label.trim() !== ""), ...novas]);
    }
    setTexto("");
    setColando(false);
  }

  function addItem() {
    setItems((prev) => [...prev, { label: "", requiresPhoto: false }]);
  }

  return (
    <div className="form-group">
      <label>Tarefas</label>
      <input type="hidden" name={name} value={JSON.stringify(items)} />
      {items.map((item, index) => (
        <div className="item-editor-row" key={index}>
          <input
            type="text"
            value={item.label}
            onChange={(e) => updateItem(index, { label: e.target.value })}
            placeholder={`Tarefa ${index + 1}`}
          />
          <label className="item-editor-checkbox">
            <input
              type="checkbox"
              checked={item.requiresPhoto}
              onChange={(e) =>
                updateItem(index, { requiresPhoto: e.target.checked })
              }
            />
            Requer foto
          </label>
          <button
            type="button"
            className="btn-small btn-delete"
            onClick={() => removeItem(index)}
            disabled={items.length === 1}
          >
            Remover
          </button>
        </div>
      ))}
      <div className="item-editor-acoes">
        <button type="button" className="btn-small" onClick={addItem}>
          + Adicionar tarefa
        </button>
        <button type="button" className="btn-small" onClick={() => setColando((v) => !v)}>
          Colar lista
        </button>
      </div>
      {colando && (
        <div className="item-editor-colar">
          <textarea
            rows={6}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={"Uma tarefa por linha. Pode colar direto do Word ou do Excel.\nNúmeros e marcadores no começo são ignorados."}
            aria-label="Lista de tarefas para colar"
          />
          <button type="button" className="btn-small" onClick={aplicarLista}>
            Adicionar à lista
          </button>
        </div>
      )}
    </div>
  );
}

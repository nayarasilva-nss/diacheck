"use client";

import { useOptimistic, useTransition } from "react";
import { alternarItemRotina } from "@/lib/actions/rotinas";

export function ItemRotina({ id, texto, feito }: { id: number; texto: string; feito: boolean }) {
  const [, start] = useTransition();
  const [otimista, setOtimista] = useOptimistic(feito);
  return (
    <label className={`rotina-item${otimista ? " feito" : ""}`}>
      <input
        type="checkbox"
        checked={otimista}
        onChange={(e) => {
          const novo = e.target.checked;
          start(async () => {
            setOtimista(novo);
            await alternarItemRotina(id, novo);
          });
        }}
      />
      <span>{texto}</span>
    </label>
  );
}

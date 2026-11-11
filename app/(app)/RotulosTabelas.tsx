"use client";
import { useEffect } from "react";

/** Copia o título de cada coluna para as células (data-label), para o celular mostrar "Recebido: 2 kg" nos cartões. */
export function RotulosTabelas() {
  useEffect(() => {
    const aplicar = () => {
      document.querySelectorAll(".data-table.rotulos").forEach((tabela) => {
        const nomes = Array.from(tabela.querySelectorAll(".data-table-head > span")).map((s) => s.textContent?.trim() ?? "");
        tabela.querySelectorAll(".data-table-row").forEach((linha) => {
          Array.from(linha.children).forEach((c, i) => {
            if (nomes[i] && c.getAttribute("data-label") !== nomes[i]) c.setAttribute("data-label", nomes[i]);
          });
        });
      });
    };
    aplicar();
    const obs = new MutationObserver(aplicar);
    obs.observe(document.body, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, []);
  return null;
}

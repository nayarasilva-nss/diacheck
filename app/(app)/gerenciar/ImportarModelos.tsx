"use client";

import { useActionState, useState, useTransition } from "react";
import { analisarPlanilha, confirmarImportacao, type ResultadoImport } from "@/lib/actions/modelos-import";

export function ImportarModelos() {
  const [aberto, setAberto] = useState(false);
  const [estado, analisar, analisando] = useActionState<ResultadoImport | undefined, FormData>(analisarPlanilha, undefined);
  const [final, setFinal] = useState<ResultadoImport | undefined>();
  const [gravando, grava] = useTransition();

  const previa = final?.criados !== undefined ? undefined : estado?.previa;
  const podeImportar = previa && previa.erros.length === 0 && previa.criar.length > 0;

  return (
    <div className="today-card" style={{ marginBottom: 16 }}>
      <div className="today-card-header">
        <div>
          <div className="today-card-title">Importar e exportar por planilha</div>
          <div className="today-card-subtitle">Monte vários modelos de uma vez no Excel.</div>
        </div>
        <button type="button" className="btn-secondary" onClick={() => setAberto((v) => !v)}>{aberto ? "Fechar" : "Abrir"}</button>
      </div>

      {aberto && (
        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <a className="btn-secondary" href="/api/modelos-checklist?acao=modelo">Baixar planilha modelo</a>
            <a className="btn-secondary" href="/api/modelos-checklist?acao=exportar">Baixar os modelos que já existem</a>
          </div>

          {final?.criados !== undefined ? (
            <div className="tone-card good">
              <div className="tone-label">{final.criados} modelo(s) importado(s)</div>
              {final.previa && final.previa.pular.length > 0 && <div className="tone-meta">Já existiam e foram pulados: {final.previa.pular.join(", ")}.</div>}
              <button type="button" className="btn-secondary" style={{ marginTop: 8 }} onClick={() => { setFinal(undefined); location.reload(); }}>Ok</button>
            </div>
          ) : (
            <form action={(fd) => { setFinal(undefined); analisar(fd); }} style={{ display: "grid", gap: 8 }}>
              <div className="form-group">
                <label htmlFor="arquivo-modelos">Planilha preenchida (.xlsx)</label>
                <input id="arquivo-modelos" type="file" name="arquivo" accept=".xlsx" required />
              </div>
              <button type="submit" className="btn-primary" disabled={analisando} style={{ justifySelf: "start" }}>{analisando ? "Lendo…" : "Ver prévia"}</button>
            </form>
          )}

          {estado?.error && <p className="error">{estado.error}</p>}
          {final?.error && <p className="error">{final.error}</p>}

          {previa && (
            <div style={{ display: "grid", gap: 8 }}>
              {previa.erros.length > 0 && (
                <div className="tone-card bad">
                  <div className="tone-label">{previa.erros.length} erro(s): corrija a planilha e envie de novo</div>
                  {previa.erros.slice(0, 20).map((e, i) => (
                    <div key={i} className="tone-meta">{e.linha ? `Linha ${e.linha}: ` : ""}{e.msg}</div>
                  ))}
                </div>
              )}
              {previa.pular.length > 0 && (
                <div className="tone-card warn">
                  <div className="tone-label">{previa.pular.length} já existe(m) e será(ão) pulado(s)</div>
                  <div className="tone-meta">{previa.pular.join(", ")}</div>
                </div>
              )}
              {previa.criar.length > 0 && (
                <div className="tone-card good">
                  <div className="tone-label">Serão criados {previa.criar.length} modelo(s)</div>
                  {previa.criar.map((m) => (
                    <div key={m.nome} className="tone-meta">
                      <strong>{m.nome}</strong> · {m.tipo === "weekly" ? "Semanal" : "Diário"} · {m.funcaoNome ?? "todas as funções"}{m.horario ? ` · até ${m.horario}` : ""} · {m.itens.length} item(ns)
                    </div>
                  ))}
                </div>
              )}
              {podeImportar && (
                <button
                  type="button"
                  className="btn-primary"
                  style={{ justifySelf: "start" }}
                  disabled={gravando}
                  onClick={() => grava(async () => setFinal(await confirmarImportacao(JSON.stringify(previa.criar))))}
                >
                  {gravando ? "Importando…" : `Importar ${previa.criar.length} modelo(s)`}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

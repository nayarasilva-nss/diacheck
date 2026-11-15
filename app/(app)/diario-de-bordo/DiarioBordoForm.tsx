"use client";

import { useRef, useState, useTransition } from "react";
import { createShiftLog } from "@/lib/actions/shift-logs";
import {
  LEADER_SELF_ASSESSMENT,
  LEADERSHIP_ACTIONS,
  SHIFT_STATUS,
  TEAM_MANAGEMENT_ACTIONS,
} from "@/lib/shift-log-constants";
import { ANOMALY_SETORES } from "@/lib/anomaly-constants";
import { checklistDayISO } from "@/lib/date-utils";
import { PendenciasEditor } from "./PendenciasEditor";

const STEPS = [
  { n: 1, label: "Status do turno" },
  { n: 2, label: "Desvio principal" },
  { n: 3, label: "Equipe e pendências" },
  { n: 4, label: "Autoavaliação" },
] as const;

export function DiarioBordoForm() {
  const [error, setError] = useState<string | undefined>();
  const [success, setSuccess] = useState(false);
  const [pendenciasKey, setPendenciasKey] = useState(0);
  const [step, setStep] = useState(1);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await createShiftLog(undefined, fd);
      if (result?.error) {
        setError(result.error);
        setSuccess(false);
      } else {
        setError(undefined);
        setSuccess(true);
        formRef.current?.reset();
        setPendenciasKey((key) => key + 1);
        setStep(1);
      }
    });
  }

  function goToStep(next: number) {
    setError(undefined);
    setStep(next);
  }

  function handleContinue() {
    const container = stepRefs.current[step - 1];
    if (container) {
      const fields = container.querySelectorAll<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >("input, select, textarea");
      for (const field of fields) {
        if (!field.checkValidity()) {
          field.reportValidity();
          return;
        }
      }
    }
    goToStep(Math.min(4, step + 1));
  }

  return (
    <form className="inline-form" ref={formRef} onSubmit={handleSubmit}>
      <div className="wizard-steps">
        {STEPS.map((s, i) => {
          const state = s.n < step ? "done" : s.n === step ? "current" : "future";
          return (
            <div className="wizard-step-wrap" key={s.n}>
              <div className="wizard-step">
                <span className={`wizard-step-circle ${state}`}>
                  {state === "done" ? "✓" : s.n}
                </span>
                <span className={`wizard-step-label ${state}`}>{s.label}</span>
              </div>
              {i < STEPS.length - 1 && <div className="wizard-step-connector" />}
            </div>
          );
        })}
      </div>

      <div ref={(el) => { stepRefs.current[0] = el; }} hidden={step !== 1}>
        <div className="form-group">
          <label htmlFor="dbDate">Data</label>
          {/* Dia operacional (muda às 02h, como o checklist): quem fecha o turno
              depois de meia-noite registra no dia do turno, não no calendário. */}
          <input id="dbDate" name="date" type="date" defaultValue={checklistDayISO()} required />
        </div>

        <div className="form-group">
          <label htmlFor="dbSetor">Setor</label>
          <select id="dbSetor" name="setor" required defaultValue="">
            <option value="" disabled>
              Selecione o setor
            </option>
            {ANOMALY_SETORES.map((setor) => (
              <option key={setor} value={setor}>
                {setor}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>Situação da operação</label>
          {SHIFT_STATUS.map((status) => (
            <div className="item-editor-row item-editor-checkbox" key={status.value}>
              <input
                type="radio"
                name="statusTurno"
                value={status.value}
                id={`status-${status.value}`}
                required
              />
              <label htmlFor={`status-${status.value}`}>{status.label}</label>
            </div>
          ))}
        </div>

        <div className="form-group">
          <label htmlFor="statusJustificativa">Justificativa</label>
          <textarea id="statusJustificativa" name="statusJustificativa" required />
        </div>
      </div>

      <div ref={(el) => { stepRefs.current[1] = el; }} hidden={step !== 2}>
        <div className="form-group">
          <label htmlFor="desvioDescricao">Principal desvio do turno</label>
          <textarea
            id="desvioDescricao"
            name="desvioDescricao"
            placeholder="Descreva o principal desvio (ou 'Nenhum desvio' se o turno correu normalmente)"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="desvioImpacto">Impacto</label>
          <textarea id="desvioImpacto" name="desvioImpacto" />
        </div>

        <div className="form-group">
          <label htmlFor="desvioCausaRaiz">Causa raiz</label>
          <input id="desvioCausaRaiz" name="desvioCausaRaiz" />
        </div>

        <div className="form-group">
          <label>Ação de liderança</label>
          {LEADERSHIP_ACTIONS.map((acao) => (
            <div className="item-editor-row item-editor-checkbox" key={acao}>
              <input type="checkbox" name="acoesLideranca" value={acao} id={`acao-${acao}`} />
              <label htmlFor={`acao-${acao}`}>{acao}</label>
            </div>
          ))}
        </div>

        <div className="form-group">
          <label htmlFor="acaoLiderancaDescricao">Descrição da ação</label>
          <textarea id="acaoLiderancaDescricao" name="acaoLiderancaDescricao" />
        </div>
      </div>

      <div ref={(el) => { stepRefs.current[2] = el; }} hidden={step !== 3}>
        <div className="form-group">
          <label htmlFor="outrasDecisoes">Outras decisões tomadas no turno</label>
          <textarea id="outrasDecisoes" name="outrasDecisoes" />
        </div>

        <div className="form-group">
          <label>Gestão da equipe</label>
          {TEAM_MANAGEMENT_ACTIONS.map((acao) => (
            <div className="item-editor-row item-editor-checkbox" key={acao}>
              <input type="checkbox" name="gestaoEquipe" value={acao} id={`gestao-${acao}`} />
              <label htmlFor={`gestao-${acao}`}>{acao}</label>
            </div>
          ))}
        </div>

        <div className="form-group">
          <label htmlFor="gestaoEquipeDescricao">Descrição</label>
          <textarea id="gestaoEquipeDescricao" name="gestaoEquipeDescricao" />
        </div>

        <PendenciasEditor key={pendenciasKey} name="pendencias" />
      </div>

      <div ref={(el) => { stepRefs.current[3] = el; }} hidden={step !== 4}>
        <div className="form-group">
          <label>Autoavaliação do líder</label>
          {LEADER_SELF_ASSESSMENT.map((item) => (
            <div className="item-editor-row item-editor-checkbox" key={item.value}>
              <input
                type="radio"
                name="autoavaliacao"
                value={item.value}
                id={`auto-${item.value}`}
                required
              />
              <label htmlFor={`auto-${item.value}`}>{item.label}</label>
            </div>
          ))}
        </div>

        <div className="form-group">
          <label htmlFor="autoavaliacaoMelhorias">O que poderia ter feito melhor</label>
          <textarea id="autoavaliacaoMelhorias" name="autoavaliacaoMelhorias" />
        </div>
      </div>

      {error && <p className="login-error">{error}</p>}
      {success && !error && (
        <p className="empty-state">Diário de bordo registrado com sucesso.</p>
      )}

      <div className="wizard-actions">
        {step > 1 ? (
          <button type="button" className="btn-cancel" onClick={() => goToStep(step - 1)}>
            Voltar
          </button>
        ) : (
          <span />
        )}
        {step < 4 ? (
          <button type="button" className="btn-primary" onClick={handleContinue}>
            Continuar
          </button>
        ) : (
          <button className="btn-save" type="submit" disabled={isPending}>
            {isPending ? "Enviando..." : "Enviar"}
          </button>
        )}
      </div>
    </form>
  );
}

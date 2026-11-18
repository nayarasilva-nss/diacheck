"use client";

import { useActionState, useEffect } from "react";
import { adicionarExcecaoEscala, definirInicioEscala } from "@/lib/actions/escala";

type Pessoa = { id: number; name: string; unitName: string | null };

export function InicioEscalaForm({ desde }: { desde: string | null }) {
  const [state, action, pending] = useActionState(definirInicioEscala, undefined);
  return (
    <form action={action} className="inline-form">
      <div className="form-group">
        <label htmlFor="escalaDesde">A escala vale a partir de</label>
        <input id="escalaDesde" name="desde" type="date" defaultValue={desde ?? ""} />
        <p className="items-count">Antes dessa data a folga é no domingo para todos. A partir dela vale a folga de cada pessoa (Usuários › Editar).</p>
      </div>
      {state?.error && <p className="login-error">{state.error}</p>}
      {state?.ok && <p className="items-count">{state.ok}</p>}
      <div className="inline-form-buttons">
        <button className="btn-save" type="submit" disabled={pending}>Salvar</button>
      </div>
    </form>
  );
}

export function ExcecaoForm({ pessoas, onDone }: { pessoas: Pessoa[]; onDone?: () => void }) {
  const [state, action, pending] = useActionState(adicionarExcecaoEscala, undefined);
  useEffect(() => {
    if (state?.ok) onDone?.();
  }, [state, onDone]);
  return (
    <form action={action} className="inline-form">
      <h4>Lançar folga ou troca</h4>
      <div className="form-group">
        <label htmlFor="excUser">Pessoa</label>
        <select id="excUser" name="userId" defaultValue="">
          <option value="" disabled>Escolha…</option>
          {pessoas.map((p) => (
            <option key={p.id} value={p.id}>{p.name}{p.unitName ? ` · ${p.unitName}` : ""}</option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <label htmlFor="excTipo">O que acontece</label>
        <select id="excTipo" name="tipo" defaultValue="folga">
          <option value="folga">Folga neste dia (não é cobrada)</option>
          <option value="trabalho">Trabalha neste dia (era folga fixa)</option>
        </select>
      </div>
      <div className="form-group">
        <label htmlFor="excDe">De</label>
        <input id="excDe" name="de" type="date" />
      </div>
      <div className="form-group">
        <label htmlFor="excAte">Até (opcional, para um período)</label>
        <input id="excAte" name="ate" type="date" />
      </div>
      {state?.error && <p className="login-error">{state.error}</p>}
      {state?.ok && <p className="items-count">{state.ok}</p>}
      <div className="inline-form-buttons">
        <button className="btn-save" type="submit" disabled={pending}>Lançar</button>
      </div>
    </form>
  );
}

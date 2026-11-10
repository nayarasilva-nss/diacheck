"use client";

import { useActionState } from "react";
import { enviarInteresse, type InteresseState } from "@/lib/actions/interesse";

export function FormInteresse() {
  const [state, action, pending] = useActionState<InteresseState, FormData>(enviarInteresse, undefined);
  if (state?.ok) {
    return <p className="lp-form-ok">Recebemos seu pedido. A gente responde em breve.</p>;
  }
  return (
    <form action={action} className="lp-form">
      <div className="lp-campo"><label htmlFor="i-nome">Seu nome</label><input id="i-nome" name="nome" required maxLength={120} autoComplete="name" /></div>
      <div className="lp-campo"><label htmlFor="i-empresa">Empresa (opcional)</label><input id="i-empresa" name="empresa" maxLength={120} autoComplete="organization" /></div>
      <div className="lp-campo"><label htmlFor="i-contato">E-mail ou WhatsApp</label><input id="i-contato" name="contato" required maxLength={160} autoComplete="email" /></div>
      <div className="lp-campo"><label htmlFor="i-msg">O que você quer organizar? (opcional)</label><textarea id="i-msg" name="mensagem" rows={3} maxLength={1000} /></div>
      <input name="site" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: "-9999px", height: 0, width: 0, opacity: 0 }} />
      {state?.error && <p className="lp-form-erro">{state.error}</p>}
      <button className="lp-btn lp-btn-main" type="submit" disabled={pending}>{pending ? "Enviando…" : "Quero conhecer"}</button>
    </form>
  );
}

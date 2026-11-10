"use client";

import { useActionState } from "react";
import { adicionarAcao, agirNoPlano, atualizarPlano, criarPlano, registrarVerificacao, type PlanoState } from "@/lib/actions/planos";

type Pessoa = { id: number; name: string };
const PERFIL = (p: string) => ({ gestor: "Gestor", master: "Gestor", gerente: "Gerente", lider: "Líder", rh: "RH" } as Record<string, string>)[p] ?? p;

function Erro({ state }: { state: PlanoState }) {
  return state?.error ? <p className="error">{state.error}</p> : null;
}

function SelectPessoa({ name, pessoas, id }: { name: string; pessoas: (Pessoa & { profile?: string })[]; id: string }) {
  return (
    <select id={id} name={name} defaultValue="">
      <option value="" disabled>Quem faz?</option>
      {pessoas.map((p) => <option key={p.id} value={p.id}>{p.name}{p.profile ? ` · ${PERFIL(p.profile)}` : ""}</option>)}
    </select>
  );
}

export function NovoPlanoForm({ pessoas, anomalias, selecionadas, inicial, hojeMais30 }: {
  pessoas: (Pessoa & { profile?: string })[];
  anomalias: { id: number; date: string; unitName: string; tipos: string[]; setores: string[] }[];
  selecionadas: number[];
  inicial: { titulo: string; problema: string; causaRaiz: string };
  hojeMais30: string;
}) {
  const [state, action, pending] = useActionState<PlanoState, FormData>(criarPlano, undefined);
  return (
    <form action={action} className="rotina-card rotina-form">
      <div className="form-group"><label htmlFor="p-titulo">Nome do plano</label><input id="p-titulo" name="titulo" defaultValue={inicial.titulo} maxLength={160} required /></div>
      <div className="form-group"><label htmlFor="p-problema">Qual é o problema? (P)</label><textarea id="p-problema" name="problema" rows={3} defaultValue={inicial.problema} required /></div>
      <div className="form-group"><label htmlFor="p-causa">Causa raiz</label><textarea id="p-causa" name="causaRaiz" rows={2} defaultValue={inicial.causaRaiz} placeholder="Por que isso acontece? Pergunte &quot;por quê?&quot; até chegar na origem" /></div>
      <div className="form-group"><label htmlFor="p-meta">Meta</label><textarea id="p-meta" name="meta" rows={2} placeholder="Ex.: zero ocorrências em 30 dias" /></div>

      <fieldset className="plano-anoms">
        <legend>Anomalias ligadas a este plano</legend>
        {anomalias.map((a) => (
          <label key={a.id}>
            <input type="checkbox" name="anomaliaIds" value={a.id} defaultChecked={selecionadas.includes(a.id)} />
            <span>{new Date(`${a.date}T12:00:00`).toLocaleDateString("pt-BR")} · {a.unitName} · {a.tipos.join(", ")} · {a.setores.join(", ")}</span>
          </label>
        ))}
      </fieldset>

      <h3 style={{ margin: "8px 0 0" }}>Ações (D)</h3>
      {[0, 1, 2].map((i) => (
        <div className="plano-acao-linha" key={i}>
          <input aria-label={`Ação ${i + 1}: o que fazer`} name="acaoDescricao" placeholder={i === 0 ? "O que fazer" : "Outra ação (opcional)"} />
          <SelectPessoa id={`ar-${i}`} name="acaoResponsavel" pessoas={pessoas} />
          <input aria-label={`Ação ${i + 1}: prazo`} type="date" name="acaoPrazo" />
        </div>
      ))}
      <p className="rotina-vazio" style={{ margin: 0 }}>Depois dá para acrescentar mais ações na tela do plano.</p>

      <div className="form-group"><label htmlFor="p-ver">Verificar se funcionou em (C)</label><input id="p-ver" type="date" name="verificarEm" defaultValue={hojeMais30} required /></div>
      <Erro state={state} />
      <button className="btn btn-primary" type="submit" disabled={pending}>Criar plano e avisar os responsáveis</button>
    </form>
  );
}

export function AdicionarAcaoForm({ planoId, pessoas }: { planoId: number; pessoas: (Pessoa & { profile?: string })[] }) {
  const [state, action, pending] = useActionState<PlanoState, FormData>(adicionarAcao, undefined);
  return (
    <form action={action} className="rotina-form" style={{ marginTop: 8 }}>
      <input type="hidden" name="planoId" value={planoId} />
      <div className="plano-acao-linha">
        <input aria-label="O que fazer" name="descricao" placeholder="Nova ação: o que fazer" />
        <SelectPessoa id="na-resp" name="responsavelId" pessoas={pessoas} />
        <input aria-label="Prazo" type="date" name="prazo" />
      </div>
      <Erro state={state} />
      <button className="btn btn-secondary" type="submit" disabled={pending}>Adicionar ação</button>
    </form>
  );
}

export function EditarPlanoForm({ plano }: { plano: { id: number; titulo: string; problema: string; causaRaiz: string; meta: string; verificarEm: string | null } }) {
  const [state, action, pending] = useActionState<PlanoState, FormData>(atualizarPlano, undefined);
  return (
    <form action={action} className="rotina-form">
      <input type="hidden" name="id" value={plano.id} />
      <div className="form-group"><label htmlFor="e-titulo">Nome</label><input id="e-titulo" name="titulo" defaultValue={plano.titulo} required /></div>
      <div className="form-group"><label htmlFor="e-prob">Problema</label><textarea id="e-prob" name="problema" rows={3} defaultValue={plano.problema} /></div>
      <div className="form-group"><label htmlFor="e-causa">Causa raiz</label><textarea id="e-causa" name="causaRaiz" rows={2} defaultValue={plano.causaRaiz} /></div>
      <div className="form-group"><label htmlFor="e-meta">Meta</label><textarea id="e-meta" name="meta" rows={2} defaultValue={plano.meta} /></div>
      <div className="form-group"><label htmlFor="e-ver">Verificar em</label><input id="e-ver" type="date" name="verificarEm" defaultValue={plano.verificarEm ?? ""} required /></div>
      <Erro state={state} />
      <button className="btn btn-secondary" type="submit" disabled={pending}>Salvar</button>
    </form>
  );
}

export function VerificacaoForm({ id, reincidencias }: { id: number; reincidencias: number }) {
  const [state, action, pending] = useActionState<PlanoState, FormData>(registrarVerificacao, undefined);
  return (
    <form action={action} className="rotina-form">
      <input type="hidden" name="id" value={id} />
      <fieldset className="rotina-dias">
        <legend>O problema voltou a acontecer?</legend>
        <label><input type="radio" name="resultado" value="eficaz" /> Não voltou</label>
        <label><input type="radio" name="resultado" value="parcial" /> Diminuiu</label>
        <label><input type="radio" name="resultado" value="nao_eficaz" /> Continua</label>
      </fieldset>
      <div className="form-group">
        <label htmlFor="v-nota">O que você viu</label>
        <textarea id="v-nota" name="nota" rows={3} placeholder={reincidencias > 0 ? `O sistema achou ${reincidencias} anomalia(s) parecida(s) depois do plano.` : "Nenhuma anomalia parecida foi registrada depois do plano."} />
      </div>
      <Erro state={state} />
      <button className="btn btn-primary" type="submit" disabled={pending}>Registrar verificação</button>
    </form>
  );
}

export function AgirForm({ id, resultado }: { id: number; resultado: string | null }) {
  const [state, action, pending] = useActionState<PlanoState, FormData>(agirNoPlano, undefined);
  return (
    <form action={action} className="rotina-form">
      <input type="hidden" name="id" value={id} />
      <div className="form-group">
        <label htmlFor="a-nota">{resultado === "nao_eficaz" ? "O que vai mudar no próximo ciclo" : "O que virou padrão"}</label>
        <textarea id="a-nota" name="nota" rows={3} placeholder={resultado === "nao_eficaz" ? "O que não funcionou e o que tentar diferente" : "Ex.: item novo no checklist de abertura, treinamento feito, regra nova"} />
      </div>
      <Erro state={state} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn btn-primary" type="submit" name="decisao" value="padronizar" disabled={pending}>Padronizar e encerrar</button>
        <button className="btn btn-secondary" type="submit" name="decisao" value="novo_ciclo" disabled={pending}>Começar novo ciclo</button>
      </div>
    </form>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireGestor } from "@/lib/auth/dal";
import { ETAPAS, RESULTADO, STATUS_ACAO, getPlano, getResponsaveis } from "@/lib/data/planos";
import { atualizarAcao, excluirPlano } from "@/lib/actions/planos";
import { checklistDayISO } from "@/lib/date-utils";
import { Stepper } from "../Stepper";
import { AdicionarAcaoForm, AgirForm, EditarPlanoForm, VerificacaoForm } from "../Forms";

const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR");

export default async function PlanoPage({ params }: { params: Promise<{ id: string }> }) {
  const gestor = await requireGestor();
  const { id } = await params;
  const dados = await getPlano(gestor.organizationId!, Number(id));
  if (!dados) notFound();
  const { plano, acoes, ligadas, reincidencias } = dados;
  const pessoas = await getResponsaveis(gestor.organizationId!);
  const hoje = checklistDayISO();
  const encerrado = plano.etapa === "encerrado";
  const etapaInfo = ETAPAS.find((e) => e.chave === plano.etapa);

  return (
    <div className="page-container">
      <p><Link href="/planos-de-acao" className="today-card-link">← Planos de ação</Link></p>
      <h1 className="page-title">{plano.titulo}{plano.ciclo > 1 ? ` · ciclo ${plano.ciclo}` : ""}</h1>
      <Stepper etapa={plano.etapa as never} />
      <p className="page-subtitle">{encerrado ? "Plano encerrado." : etapaInfo ? `${etapaInfo.nome}: ${etapaInfo.ajuda}.` : ""}</p>

      {plano.etapa === "check" && (
        <section className="rotina-card">
          <header><h2>Verificar (C)</h2>{plano.verificarEm && <span className="rotina-chip">verificar em {fmt(plano.verificarEm)}</span>}</header>
          <p className="rotina-vazio">
            {reincidencias.length > 0
              ? `Depois que o plano foi criado, o sistema achou ${reincidencias.length} anomalia(s) do mesmo tipo e setor nas mesmas unidades:`
              : "Depois que o plano foi criado, nenhuma anomalia do mesmo tipo e setor foi registrada nas mesmas unidades."}
          </p>
          {reincidencias.slice(0, 8).map((r) => (
            <div key={r.id} className="resumo-linha"><span>{fmt(r.date)} · {r.unitName} · {r.tipos.join(", ")}</span><span className="rotina-chip atraso">voltou</span></div>
          ))}
          <VerificacaoForm id={plano.id} reincidencias={reincidencias.length} />
        </section>
      )}

      {plano.etapa === "act" && (
        <section className="rotina-card">
          <header><h2>Agir (A)</h2>{plano.verificacaoResultado && <span className="rotina-chip">{RESULTADO[plano.verificacaoResultado]}</span>}</header>
          <p className="rotina-vazio">{plano.verificacaoNota}</p>
          <AgirForm id={plano.id} resultado={plano.verificacaoResultado} />
        </section>
      )}

      {encerrado && (
        <section className="rotina-card">
          <header><h2>Resultado</h2>{plano.verificacaoResultado && <span className="rotina-chip ok">{RESULTADO[plano.verificacaoResultado]}</span>}</header>
          {plano.verificacaoNota && <p>{plano.verificacaoNota}</p>}
          {plano.padronizacaoNota && <p><strong>Padrão / próximo passo:</strong> {plano.padronizacaoNota}</p>}
        </section>
      )}

      <section className="rotina-card">
        <header><h2>Ações (D)</h2><span className="rotina-chip">{acoes.filter((a) => a.status === "feita").length}/{acoes.length}</span></header>
        {acoes.length === 0 && <p className="rotina-vazio">Nenhuma ação ainda. Acrescente abaixo para o plano seguir para a execução.</p>}
        {acoes.map((a) => {
          const atrasada = a.status !== "feita" && a.prazo < hoje;
          return (
            <div key={a.id} className="plano-acao">
              <div className="resumo-linha" style={{ borderTop: 0, padding: 0 }}>
                <span><strong>{a.descricao}</strong><br /><span style={{ color: "var(--text-muted)" }}>{a.responsavel} · até {fmt(a.prazo)}</span></span>
                <span className={atrasada ? "rotina-chip atraso" : a.status === "feita" ? "rotina-chip ok" : "rotina-chip"}>{atrasada ? "Atrasada" : STATUS_ACAO[a.status]}</span>
              </div>
              {a.notaExecucao && <p className="rotina-vazio" style={{ margin: "4px 0 0" }}>{a.notaExecucao}</p>}
              {!encerrado && (
                <form action={atualizarAcao} className="plano-status">
                  <input type="hidden" name="id" value={a.id} />
                  <select name="status" defaultValue={a.status} aria-label="Situação">
                    <option value="a_fazer">A fazer</option>
                    <option value="em_andamento">Em andamento</option>
                    <option value="feita">Feita</option>
                  </select>
                  <input name="nota" placeholder="Observação" aria-label="Observação" />
                  <button className="btn btn-secondary" type="submit">Atualizar</button>
                </form>
              )}
            </div>
          );
        })}
        {!encerrado && <AdicionarAcaoForm planoId={plano.id} pessoas={pessoas} />}
      </section>

      <section className="rotina-card">
        <header><h2>Planejar (P)</h2></header>
        {encerrado ? (
          <>
            <p><strong>Problema:</strong> {plano.problema}</p>
            {plano.causaRaiz && <p><strong>Causa raiz:</strong> {plano.causaRaiz}</p>}
            {plano.meta && <p><strong>Meta:</strong> {plano.meta}</p>}
          </>
        ) : (
          <EditarPlanoForm plano={plano} />
        )}
        {ligadas.length > 0 && (
          <>
            <h3 style={{ margin: "14px 0 4px", fontSize: 14 }}>Anomalias ligadas</h3>
            {ligadas.map((l) => (
              <div key={l.id} className="resumo-linha"><span>{fmt(l.date)} · {l.unitName} · {l.tipos.join(", ")} · {l.setores.join(", ")}</span></div>
            ))}
          </>
        )}
      </section>

      {!encerrado && (
        <form action={excluirPlano}>
          <input type="hidden" name="id" value={plano.id} />
          <button className="btn btn-secondary" type="submit">Excluir plano</button>
        </form>
      )}
    </div>
  );
}

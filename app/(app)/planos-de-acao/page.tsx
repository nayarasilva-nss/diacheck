import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/dal";
import { isGestorProfile } from "@/lib/auth/profile";
import { ETAPAS, STATUS_ACAO, getMinhasAcoes, getPlanos } from "@/lib/data/planos";
import { atualizarAcao } from "@/lib/actions/planos";
import { checklistDayISO } from "@/lib/date-utils";
import { Stepper } from "./Stepper";

const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR");

export default async function PlanosPage() {
  const user = await getCurrentUser();
  const gestor = isGestorProfile(user.profile);
  const hoje = checklistDayISO();
  const [minhas, planos] = await Promise.all([getMinhasAcoes(user.id), gestor ? getPlanos(user.organizationId!) : Promise.resolve([])]);
  const abertos = planos.filter((p) => p.etapa !== "encerrado");
  const encerrados = planos.filter((p) => p.etapa === "encerrado");

  return (
    <div className="page-container">
      <h1 className="page-title">Planos de ação</h1>
      <p className="page-subtitle">Ciclo PDCA: planejar, executar, verificar e agir. {gestor ? "" : "Aqui ficam as ações que são suas."}</p>

      {gestor && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
          <Link className="btn btn-primary" href="/planos-de-acao/novo">Novo plano</Link>
          <Link className="btn btn-secondary" href="/anomalias/analise">Ver análise das anomalias</Link>
        </div>
      )}

      <h2 className="rotina-sec">Minhas ações</h2>
      {minhas.length === 0 && <p className="rotina-vazio">Nenhuma ação para você agora.</p>}
      {minhas.map(({ a, plano }) => {
        const atrasada = a.status !== "feita" && a.prazo < hoje;
        return (
          <section className="rotina-card" key={a.id}>
            <header>
              <h2>{a.descricao}</h2>
              <span className={atrasada ? "rotina-chip atraso" : a.status === "feita" ? "rotina-chip ok" : "rotina-chip"}>{atrasada ? "Atrasada" : STATUS_ACAO[a.status]}</span>
            </header>
            <p className="rotina-vazio" style={{ margin: "0 0 8px" }}>{plano} · prazo {fmt(a.prazo)}</p>
            <form action={atualizarAcao} className="plano-status">
              <input type="hidden" name="id" value={a.id} />
              <select name="status" defaultValue={a.status} aria-label="Situação da ação">
                <option value="a_fazer">A fazer</option>
                <option value="em_andamento">Em andamento</option>
                <option value="feita">Feita</option>
              </select>
              <input name="nota" defaultValue={a.notaExecucao ?? ""} placeholder="Observação (opcional)" aria-label="Observação" />
              <button className="btn btn-secondary" type="submit">Atualizar</button>
            </form>
          </section>
        );
      })}

      {gestor && (
        <>
          <h2 className="rotina-sec">Planos em andamento ({abertos.length})</h2>
          {abertos.length === 0 && <p className="rotina-vazio">Nenhum plano aberto. Crie um a partir de uma anomalia ou da análise.</p>}
          {abertos.map((p) => (
            <Link key={p.id} href={`/planos-de-acao/${p.id}`} className="rotina-card plano-item">
              <header>
                <h2>{p.titulo}{p.ciclo > 1 ? ` · ciclo ${p.ciclo}` : ""}</h2>
                <span className={p.atrasadas > 0 ? "rotina-chip atraso" : "rotina-chip"}>{p.atrasadas > 0 ? `${p.atrasadas} atrasada(s)` : `${p.feitas}/${p.total} ações`}</span>
              </header>
              <Stepper etapa={p.etapa as never} />
              <p className="rotina-vazio" style={{ margin: "6px 0 0" }}>{ETAPAS.find((e) => e.chave === p.etapa)?.ajuda}{p.verificarEm ? ` · verificar em ${fmt(p.verificarEm)}` : ""}</p>
            </Link>
          ))}

          {encerrados.length > 0 && (
            <>
              <h2 className="rotina-sec">Encerrados ({encerrados.length})</h2>
              {encerrados.slice(0, 15).map((p) => (
                <Link key={p.id} href={`/planos-de-acao/${p.id}`} className="resumo-linha">
                  <span>{p.titulo}{p.ciclo > 1 ? ` · ciclo ${p.ciclo}` : ""}</span>
                  <span className="rotina-chip ok">{p.verificacaoResultado === "eficaz" ? "Eficaz" : p.verificacaoResultado === "parcial" ? "Parcial" : "Novo ciclo"}</span>
                </Link>
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}

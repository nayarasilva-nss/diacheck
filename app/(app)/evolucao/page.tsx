import { getCurrentUser } from "@/lib/auth/dal";
import { getEvolucao } from "@/lib/data/evolucao";

const ROTULO = { ok: "Tudo feito", parcial: "Parte feita", falhou: "Nada feito", sem: "Nada esperado (folga)" } as const;

export default async function EvolucaoPage() {
  const user = await getCurrentUser();
  const ev = await getEvolucao(user.organizationId!, user.id, user.unitId);
  const semDados = ev.diasComMeta === 0 && ev.atual === 0;

  return (
    <div className="page-container">
      <h1 className="page-title">Minha evolução</h1>
      <p className="page-subtitle">Um dia conta quando você faz tudo o que era esperado: checklists e rotinas.</p>

      <div className="evo-kpis">
        <div className="evo-kpi"><b>{ev.atual}</b><span>{ev.atual === 1 ? "dia seguido" : "dias seguidos"}</span></div>
        <div className="evo-kpi"><b>{ev.melhor}</b><span>melhor sequência (60 dias)</span></div>
        <div className="evo-kpi"><b>{ev.taxa30 === null ? "–" : `${ev.taxa30}%`}</b><span>dias completos (30 dias)</span></div>
      </div>

      {semDados ? (
        <p className="rotina-vazio">Ainda não há dias para contar. Quando você tiver checklists ou rotinas, a evolução aparece aqui.</p>
      ) : (
        <section className="rotina-card">
          <header><h2>Últimos 30 dias</h2></header>
          <div className="evo-barras" role="img" aria-label={`Evolução dos últimos 30 dias: ${ev.ok30} de ${ev.diasComMeta} dias completos`}>
            {ev.dias.map((d) => {
              const pct = d.esperados ? Math.max(6, Math.round((d.feitos / d.esperados) * 100)) : 6;
              const dia = new Date(`${d.date}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
              return (
                <div key={d.date} className={`evo-barra ${d.status}`} title={`${dia}: ${d.status === "sem" ? ROTULO.sem : `${ROTULO[d.status]} (${d.feitos}/${d.esperados})`}`}>
                  <i style={{ height: `${pct}%` }} />
                </div>
              );
            })}
          </div>
          <div className="evo-legenda">
            <span><i className="ok" /> Tudo feito</span>
            <span><i className="parcial" /> Parte</span>
            <span><i className="falhou" /> Nada</span>
            <span><i className="sem" /> Folga / nada esperado</span>
          </div>
        </section>
      )}
    </div>
  );
}

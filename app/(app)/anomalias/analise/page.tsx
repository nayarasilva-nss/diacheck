import Link from "next/link";
import { requireGestor } from "@/lib/auth/dal";
import { getAnalise } from "@/lib/data/planos";

const PERIODOS = [30, 60, 90];

function Barras({ titulo, dados }: { titulo: string; dados: [string, number][] }) {
  const max = Math.max(1, ...dados.map((d) => d[1]));
  return (
    <section className="rotina-card">
      <header><h2>{titulo}</h2></header>
      {dados.length === 0 && <p className="rotina-vazio">Sem registros no período.</p>}
      {dados.slice(0, 8).map(([nome, n]) => (
        <div key={nome} className="analise-linha">
          <span>{nome}</span>
          <div className="analise-barra"><i style={{ width: `${Math.round((n / max) * 100)}%` }} /></div>
          <b>{n}</b>
        </div>
      ))}
    </section>
  );
}

export default async function AnaliseAnomaliasPage({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  const gestor = await requireGestor();
  const { dias: raw } = await searchParams;
  const dias = PERIODOS.includes(Number(raw)) ? Number(raw) : 30;
  const a = await getAnalise(gestor.organizationId!, dias);
  const maxSem = Math.max(1, ...a.semanas.map((s) => s[1]));

  return (
    <div className="page-container">
      <p><Link href="/anomalias" className="today-card-link">← Anomalias</Link></p>
      <h1 className="page-title">Análise das anomalias</h1>
      <p className="page-subtitle">O que mais acontece e o que se repete. Repetição pede plano de ação.</p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0 16px" }}>
        {PERIODOS.map((p) => (
          <Link key={p} href={`/anomalias/analise?dias=${p}`} className={p === dias ? "btn btn-primary" : "btn btn-secondary"}>Últimos {p} dias</Link>
        ))}
        <Link href="/planos-de-acao" className="btn btn-secondary">Planos de ação</Link>
      </div>

      <div className="evo-kpis">
        <div className="evo-kpi"><b>{a.total}</b><span>anomalias no período</span></div>
        <div className="evo-kpi"><b>{a.abertas}</b><span>ainda abertas</span></div>
        <div className="evo-kpi"><b>{a.recorrencias.length}</b><span>padrões que se repetem</span></div>
      </div>

      <section className="rotina-card">
        <header><h2>Se repetem (3 ou mais)</h2></header>
        {a.recorrencias.length === 0 && <p className="rotina-vazio">Nenhum padrão se repetiu 3 vezes ou mais neste período.</p>}
        {a.recorrencias.map((r) => (
          <div key={`${r.unitName}|${r.tipo}|${r.setor}`} className="resumo-linha">
            <span><strong>{r.tipo}</strong> · {r.setor} · {r.unitName}</span>
            <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span className="rotina-chip atraso">{r.ids.length}×</span>
              <Link className="btn btn-secondary" style={{ minHeight: 0, padding: "6px 12px", fontSize: 13 }} href={`/planos-de-acao/novo?anomalia=${r.ids.join(",")}`}>Criar plano</Link>
            </span>
          </div>
        ))}
      </section>

      <div className="analise-grade">
        <Barras titulo="Por tipo" dados={a.porTipo} />
        <Barras titulo="Por setor" dados={a.porSetor} />
        <Barras titulo="Por unidade" dados={a.porUnidade} />
      </div>

      <section className="rotina-card">
        <header><h2>Por semana</h2></header>
        {a.semanas.length === 0 ? <p className="rotina-vazio">Sem registros no período.</p> : (
          <div className="evo-barras" role="img" aria-label="Anomalias por semana">
            {a.semanas.map(([sem, n]) => (
              <div key={sem} className="evo-barra parcial" title={`Semana de ${new Date(`${sem}T12:00:00`).toLocaleDateString("pt-BR")}: ${n}`}>
                <i style={{ height: `${Math.max(6, Math.round((n / maxSem) * 100))}%` }} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/dal";
import { isGestorProfile } from "@/lib/auth/profile";
import { resolveEffectiveUnitId } from "@/lib/auth/covering-unit";
import { resolveEffectiveJobFunctionId } from "@/lib/auth/gestor-funcao";
import { getChecklistsForUser } from "@/lib/data/checklists";
import { getAnomaliesByScope } from "@/lib/data/anomalies";
import { getOpenPendenciasForUnit } from "@/lib/data/shift-logs";
import { getAtrasosHoje } from "@/lib/data/painel";
import { getMinhasRotinas } from "@/lib/data/rotinas";
import { checklistDayISO } from "@/lib/date-utils";

export default async function ResumoDoDiaPage() {
  const user = await getCurrentUser();
  const orgId = user.organizationId!;
  const hoje = checklistDayISO();
  const isGestor = isGestorProfile(user.profile);
  const effectiveUnitId = await resolveEffectiveUnitId(user);
  const viewer = {
    id: user.id,
    profile: user.profile,
    organizationId: orgId,
    jobFunctionId: await resolveEffectiveJobFunctionId(user),
    unitId: user.unitId,
    effectiveUnitId,
  };

  const [checklists, rotinas, minhasAnomalias, pendencias, atrasos] = await Promise.all([
    getChecklistsForUser("daily", viewer),
    getMinhasRotinas(user.id),
    getAnomaliesByScope({ mode: "own", userId: user.id }, orgId, { sinceDate: hoje }),
    user.unitId ? getOpenPendenciasForUnit(user.unitId, orgId) : Promise.resolve([]),
    isGestor ? getAtrasosHoje(orgId, null) : Promise.resolve([]),
  ]);

  const linhas = checklists.map((c) => {
    const feitos = c.items.filter((i) => i.status !== "pending").length;
    return { id: c.id, nome: c.name, feitos, total: c.items.length };
  });
  const checklistsPendentes = linhas.filter((l) => l.feitos < l.total);
  const rotinasHoje = rotinas.filter((r) => r.aplicaHoje);
  const rotinasPendentes = rotinasHoje.filter((r) => r.itens.some((i) => !i.feito));
  const anomaliasHoje = minhasAnomalias.filter((a) => a.date === hoje);
  const faltam = checklistsPendentes.length + rotinasPendentes.length;

  return (
    <div className="page-container">
      <h1 className="page-title">Resumo do dia</h1>
      <p className="page-subtitle">{new Date(`${hoje}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</p>

      <div className={`tone-card ${faltam === 0 ? "good" : "warn"}`} style={{ margin: "16px 0" }}>
        <div className="tone-label">{faltam === 0 ? "Tudo em ordem" : `Falta fechar ${faltam} ${faltam === 1 ? "coisa" : "coisas"}`}</div>
        <div className="tone-meta">
          {faltam === 0
            ? "Checklists e rotinas de hoje concluídos."
            : "O que ficou pendente aparece abaixo e segue para amanhã."}
        </div>
      </div>

      <section className="rotina-card">
        <header>
          <h2>Checklists</h2>
          <span className={checklistsPendentes.length === 0 ? "rotina-chip ok" : "rotina-chip"}>{linhas.length - checklistsPendentes.length}/{linhas.length}</span>
        </header>
        {linhas.length === 0 && <p className="rotina-vazio">Nenhum checklist para você hoje.</p>}
        {linhas.map((l) => (
          <Link key={l.id} href={`/checklist/${l.id}?type=daily`} className="resumo-linha">
            <span>{l.nome}</span>
            <span className={l.feitos === l.total ? "rotina-chip ok" : "rotina-chip"}>{l.feitos === l.total ? "Concluído" : `${l.feitos}/${l.total} · segue pendente`}</span>
          </Link>
        ))}
      </section>

      {rotinasHoje.length > 0 && (
        <section className="rotina-card">
          <header>
            <h2>Minhas rotinas</h2>
            <Link href="/rotinas" className="today-card-link">Abrir</Link>
          </header>
          {rotinasHoje.map((r) => {
            const feitos = r.itens.filter((i) => i.feito).length;
            return (
              <Link key={r.id} href="/rotinas" className="resumo-linha">
                <span>{r.nome}</span>
                <span className={feitos === r.itens.length ? "rotina-chip ok" : "rotina-chip"}>{feitos === r.itens.length ? "Concluída" : `${feitos}/${r.itens.length} · segue pendente`}</span>
              </Link>
            );
          })}
        </section>
      )}

      <section className="rotina-card">
        <header>
          <h2>Anomalias que você registrou hoje</h2>
          <span className="rotina-chip">{anomaliasHoje.length}</span>
        </header>
        {anomaliasHoje.length === 0 ? <p className="rotina-vazio">Nenhuma.</p> : anomaliasHoje.map((a) => (
          <div key={a.id} className="resumo-linha"><span>{a.tipos.join(", ")}</span><span className="rotina-chip">{a.status === "aberta" ? "Aberta" : "Tratada"}</span></div>
        ))}
      </section>

      {user.unitId && (
        <section className="rotina-card">
          <header>
            <h2>Pendências do diário de bordo</h2>
            <span className="rotina-chip">{pendencias.length}</span>
          </header>
          {pendencias.length === 0 ? <p className="rotina-vazio">Nada em aberto na unidade.</p> : pendencias.slice(0, 10).map((p) => (
            <div key={p.id} className="resumo-linha"><span>{p.descricao}{p.responsavel ? ` · ${p.responsavel}` : ""}</span><span className="rotina-chip">segue para amanhã</span></div>
          ))}
          {(user.profile === "gerente" || user.profile === "lider") && (
            <Link href="/diario-de-bordo" className="btn btn-secondary" style={{ display: "inline-block", marginTop: 10 }}>Registrar o turno no diário de bordo</Link>
          )}
        </section>
      )}

      {isGestor && atrasos.length > 0 && (
        <section className="rotina-card">
          <header>
            <h2>Checklists em atraso na operação</h2>
            <span className="rotina-chip">{atrasos.length}</span>
          </header>
          {atrasos.slice(0, 10).map((a, i) => (
            <div key={i} className="resumo-linha"><span>{a.typeName} · {a.userName}{a.unitName ? ` · ${a.unitName}` : ""}</span><span className="rotina-chip">limite {a.deadlineTime}</span></div>
          ))}
        </section>
      )}
    </div>
  );
}

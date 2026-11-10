import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { fechamentosDia } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { getResumoDoDia } from "@/lib/data/resumo-dia";
import { getEvolucao } from "@/lib/data/evolucao";
import { fecharDia } from "@/lib/actions/fechar-dia";

type Guardado = { checklists: { feitos: number; total: number }; rotinas: { feitas: number; total: number }; anomalias: number; pendentes: string[] };

export default async function ResumoDoDiaPage() {
  const user = await getCurrentUser();
  const orgId = user.organizationId!;
  const [r, evolucao, fechamentos] = await Promise.all([
    getResumoDoDia(user),
    getEvolucao(orgId, user.id, user.unitId),
    db.select().from(fechamentosDia).where(eq(fechamentosDia.userId, user.id)).orderBy(desc(fechamentosDia.date)).limit(8),
  ]);
  const { hoje, isGestor, linhas, checklistsPendentes, rotinasHoje, anomaliasHoje, pendencias, atrasos, faltam } = r;
  const fechadoHoje = fechamentos.find((f) => f.date === hoje);
  const anteriores = fechamentos.filter((f) => f.date !== hoje).slice(0, 7);

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

      {fechadoHoje ? (
        <div className="tone-card good" style={{ margin: "0 0 12px" }}>
          <div className="tone-label">Dia fechado às {fechadoHoje.createdAt.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}</div>
          {fechadoHoje.nota && <div className="tone-meta">{fechadoHoje.nota}</div>}
        </div>
      ) : null}
      <form action={fecharDia} className="rotina-card rotina-form" style={{ margin: "0 0 12px" }}>
        <div className="form-group">
          <label htmlFor="nota">{fechadoHoje ? "Atualizar o fechamento" : "Observação do dia (opcional)"}</label>
          <textarea id="nota" name="nota" rows={2} maxLength={1000} defaultValue={fechadoHoje?.nota ?? ""} placeholder="Algo que o próximo turno precisa saber" />
        </div>
        <button className="btn btn-primary" type="submit">{fechadoHoje ? "Salvar de novo" : "Fechar o dia"}</button>
      </form>

      <Link href="/evolucao" className="resumo-linha" style={{ borderTop: 0, marginBottom: 8 }}>
        <span>{evolucao.atual > 0 ? `${evolucao.atual} ${evolucao.atual === 1 ? "dia seguido" : "dias seguidos"} com tudo em ordem` : "Feche o dia hoje para começar uma sequência"}</span>
        <span className="today-card-link">Ver evolução</span>
      </Link>

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
      {anteriores.length > 0 && (
        <section className="rotina-card">
          <header><h2>Dias anteriores</h2></header>
          {anteriores.map((f) => {
            const g = f.resumo as Guardado;
            return (
              <div key={f.id} className="resumo-linha" style={{ alignItems: "flex-start" }}>
                <span>
                  {new Date(`${f.date}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}
                  {f.nota ? ` · ${f.nota}` : ""}
                </span>
                <span className={g.pendentes.length === 0 ? "rotina-chip ok" : "rotina-chip"}>{g.pendentes.length === 0 ? "Tudo feito" : `${g.pendentes.length} pendente(s)`}</span>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}

import Link from "next/link";
import { isGestorProfile } from "@/lib/auth/profile";
import { getCurrentUser } from "@/lib/auth/dal";
import { resolveEffectiveUnitId } from "@/lib/auth/covering-unit";
import { resolveEffectiveJobFunctionId } from "@/lib/auth/gestor-funcao";
import { getChecklistsForUser, todayISO as checklistTodayISO } from "@/lib/data/checklists";
import {
  getDashboardStats,
  getRanking,
  getUsersWithoutChecklistToday,
} from "@/lib/data/dashboard";
import { getFilletingMonthlySummary } from "@/lib/data/filleting";
import { getRestoIngestaMonthlySummary } from "@/lib/data/resto-ingesta";
import { getOpenPendenciasForUnit } from "@/lib/data/shift-logs";
import { getPendingCoAudits } from "@/lib/data/audits";
import { resolvePendencia } from "@/lib/actions/shift-logs";
import { canSubmitFilleting } from "@/lib/data/filleting";
import { canSubmitRestoIngesta } from "@/lib/data/resto-ingesta";
import { tiposPermitidos } from "@/lib/auth/requisicoes";
import { getRecebimentosComDiferenca } from "@/lib/data/requisicoes";
import { getAtrasosHoje } from "@/lib/data/painel";
import { getMinhasRotinas } from "@/lib/data/rotinas";
import { getUnits, resolveUnitScope } from "@/lib/data/units";
import { greeting, todayISO, todayShortLabel } from "@/lib/date-utils";
import { UnitFilter } from "../UnitFilter";
import { DateFilter } from "../DateFilter";

const MEDALS = ["🥇", "🥈", "🥉"];

function checklistState(done: number, total: number): "concluido" | "andamento" | "aguardando" {
  if (total > 0 && done === total) return "concluido";
  if (done > 0) return "andamento";
  return "aguardando";
}

const STATE_LABEL = {
  concluido: "Concluído",
  andamento: "Em andamento",
  aguardando: "Aguardando",
} as const;

export default async function HojePage({
  searchParams,
}: {
  searchParams: Promise<{ unit?: string; date?: string }>;
}) {
  const user = await getCurrentUser();
  const effectiveUnitId = await resolveEffectiveUnitId(user);
  const viewer = {
    id: user.id,
    profile: user.profile,
    organizationId: user.organizationId!,
    jobFunctionId: await resolveEffectiveJobFunctionId(user),
    unitId: user.unitId,
    effectiveUnitId,
  };

  const isGestor = isGestorProfile(user.profile);
  const isRh = user.profile === "rh";
  const canWriteShiftLog = user.profile === "gerente" || user.profile === "lider";
  const canCreateAnomaly = !isRh;
  const canRequestRequisicao = tiposPermitidos(user).length > 0;

  const { unit: rawUnit, date: rawDate } = await searchParams;
  const painelDate = rawDate || checklistTodayISO();
  const isPainelToday = painelDate === checklistTodayISO();
  const requestedUnitId = rawUnit ? Number(rawUnit) : null;
  const painelUnitId = resolveUnitScope(user, requestedUnitId);

  const [units, checklists, coAudits, atrasos, diferencas] = await Promise.all([
    user.unitId || isGestor || isRh ? getUnits(user.organizationId!) : Promise.resolve([]),
    isRh ? Promise.resolve([]) : getChecklistsForUser("daily", viewer),
    isGestor ? getPendingCoAudits(user.organizationId!, user.id) : Promise.resolve([]),
    // quem está marcado como "sem checklist obrigatório" não vê o card de atraso
    (isGestor || user.profile === "gerente") && user.checklistObrigatorio && isPainelToday ? getAtrasosHoje(user.organizationId!, painelUnitId) : Promise.resolve([]),
    isGestor ? getRecebimentosComDiferenca(user.organizationId!) : Promise.resolve([]),
  ]);
  const unitName = units.find((u) => u.id === user.unitId)?.name ?? null;
  const rotinasHoje = isRh ? [] : (await getMinhasRotinas(user.id)).filter((r) => r.aplicaHoje);

  const [pendencias, painelStats, ranking, filletingSummary, restoIngestaSummary, missingChecklist] =
    await Promise.all([
      user.unitId ? getOpenPendenciasForUnit(user.unitId, user.organizationId!) : Promise.resolve([]),
      getDashboardStats(painelUnitId, user.organizationId!, painelDate),
      getRanking(painelUnitId, user.organizationId!, painelDate),
      getFilletingMonthlySummary(painelUnitId, user.organizationId!, painelDate),
      getRestoIngestaMonthlySummary(painelUnitId, user.organizationId!, painelDate),
      getUsersWithoutChecklistToday(painelUnitId, user.organizationId!, painelDate),
    ]);
  const painelDateLabel = new Date(`${painelDate}T00:00:00`).toLocaleDateString("pt-BR");

  const totalItems = checklists.reduce((sum, c) => sum + c.items.length, 0);
  const doneItems = checklists.reduce(
    (sum, c) => sum + c.items.filter((i) => i.status !== "pending").length,
    0,
  );
  const overallPct = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;

  const sortedChecklists = [...checklists].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <div className="page-topbar">
        <div>
          <h2 style={{ marginBottom: 0 }}>
            {greeting()}, {user.name.split(" ")[0]}
          </h2>
          <div className="today-card-subtitle" style={{ marginTop: 4 }}>
            {[unitName, todayShortLabel()].filter(Boolean).join(" · ")}
          </div>
        </div>
        {canCreateAnomaly && (
          <Link href="/anomalias" className="btn-primary hide-mobile" style={{ display: "inline-block" }}>
            Registrar anomalia
          </Link>
        )}
      </div>

      <div className="hoje-layout">
        <div className="hoje-column">
          {atrasos.length > 0 && (
            <div className="tone-card bad" style={{ marginBottom: 16 }}>
              <div className="tone-label">Checklists em atraso · {atrasos.length}</div>
              {atrasos.slice(0, 8).map((a, i) => (
                <div key={i} style={{ padding: "8px 0", borderTop: i ? "1px solid color-mix(in srgb, var(--tone) 20%, transparent)" : "none", fontSize: 14 }}>
                  <strong>{a.typeName}</strong>
                  <div className="tone-meta" style={{ marginTop: 2 }}>
                    {a.userName}{a.unitName ? ` · ${a.unitName}` : ""} · limite {a.deadlineTime} · {a.answered === 0 ? "não iniciado" : `${a.answered}/${a.total} itens`} · {a.minutesLate >= 60 ? `${Math.floor(a.minutesLate / 60)} h ${a.minutesLate % 60} min` : `${a.minutesLate} min`} de atraso
                  </div>
                </div>
              ))}
              {atrasos.length > 8 && <div className="tone-meta">e mais {atrasos.length - 8}…</div>}
            </div>
          )}

          {diferencas.length > 0 && (
            <div className="tone-card warn" style={{ marginBottom: 16 }}>
              <div className="tone-label">Recebimentos com diferença · {diferencas.length}</div>
              {diferencas.slice(0, 6).map((d, i) => (
                <div key={d.id} style={{ padding: "8px 0", borderTop: i ? "1px solid color-mix(in srgb, var(--tone) 20%, transparent)" : "none", fontSize: 14 }}>
                  <Link href={`/requisicoes?tipo=externa`}><strong>Requisição #{d.id} · {d.unitName}</strong></Link>
                  <div className="tone-meta" style={{ marginTop: 2 }}>
                    {d.itens.map((it) => `${it.nome}: enviado ${it.enviado}${it.unidadeMedida}, recebido ${it.recebido}${it.unidadeMedida}`).join(" · ")}
                    {d.recebimentoObs ? ` — ${d.recebimentoObs}` : ""}
                  </div>
                </div>
              ))}
              {diferencas.length > 6 && <div className="tone-meta">e mais {diferencas.length - 6}…</div>}
            </div>
          )}

          {coAudits.length > 0 && (
            <div className="today-card">
              <div className="today-card-header">
                <div>
                  <div className="today-card-title">Auditorias em conjunto</div>
                  <div className="today-card-subtitle">
                    Você foi convidado a avaliar junto
                  </div>
                </div>
              </div>
              {coAudits.map((a) => (
                <div className="list-item" key={a.id}>
                  <div className="info">
                    <h4>
                      {a.unitName} · {new Date(`${a.visitDate}T00:00:00`).toLocaleDateString("pt-BR")}
                    </h4>
                    <p>Iniciada por {a.auditorName}</p>
                  </div>
                  <div className="list-item-actions">
                    <Link href={`/auditorias/${a.id}`} className="btn-primary">
                      Abrir
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Gestor não precisa ter checklist atribuído — só aparece pra
              ele se de fato tiver algum (por opção/necessidade), sem o
              estado vazio que faz sentido pros outros perfis. */}
          {!isRh && (!isGestor || sortedChecklists.length > 0) ? (
            <>
              {sortedChecklists.length === 0 ? (
                <div className="today-card">
                  <div className="today-card-title">Seu turno agora</div>
                  <p className="empty-state">
                    Nenhum checklist disponível para você ainda. Peça a um Gestor para criar um
                    modelo para a sua função.
                  </p>
                </div>
              ) : (
                (() => {
                  const linhas = sortedChecklists.map((c) => {
                    const done = c.items.filter((i) => i.status !== "pending").length;
                    const total = c.items.length;
                    return {
                      c,
                      done,
                      total,
                      state: checklistState(done, total),
                      requiresPhoto: c.items.filter((i) => i.requiresPhoto).length,
                      bloqueado: c.prerequisitosPendentes.length > 0,
                    };
                  });
                  // o próximo passo: o que já está em andamento; senão o primeiro que dá para começar
                  const proximo =
                    linhas.find((l) => l.state === "andamento" && !l.bloqueado) ??
                    linhas.find((l) => l.state === "aguardando" && !l.bloqueado);
                  return (
                    <>
                      {proximo ? (
                        <div className="turno-hero">
                          <div className="turno-hero-top">
                            {totalItems > 0 && (
                              <div className="turno-ring" style={{ background: `conic-gradient(#fff ${overallPct}%, rgba(255,255,255,.3) 0)` }}>
                                <div className="turno-ring-inner">{overallPct}%</div>
                              </div>
                            )}
                            <div style={{ minWidth: 0 }}>
                              <div className="turno-label">Seu turno agora</div>
                              <div className="turno-name">{proximo.c.name}</div>
                              <div className="turno-meta">
                                {proximo.state === "andamento"
                                  ? `${proximo.done}/${proximo.total} itens`
                                  : `${proximo.total} itens${proximo.requiresPhoto > 0 ? ` · ${proximo.requiresPhoto} exigem foto` : ""}`}
                              </div>
                            </div>
                          </div>
                          <Link href={`/checklist/${proximo.c.id}?type=daily`} className="turno-cta">
                            {proximo.state === "andamento" ? "Continuar" : "Começar"}
                          </Link>
                        </div>
                      ) : linhas.every((l) => l.state === "concluido") ? (
                        <div className="turno-ok">
                          <div className="turno-ok-mark">✓</div>
                          <div>
                            <div className="turno-ok-title">Todos os checklists concluídos</div>
                            <div className="turno-ok-meta">{doneItems} de {totalItems} itens registrados</div>
                          </div>
                        </div>
                      ) : null}

                      {rotinasHoje.length > 0 && (
                        <div className="today-card">
                          <div className="today-card-header">
                            <div className="today-card-title">Minhas rotinas</div>
                            <Link href="/rotinas" className="today-card-link">Abrir</Link>
                          </div>
                          <div className="turno-lista">
                            {rotinasHoje.map((r) => {
                              const feitos = r.itens.filter((i) => i.feito).length;
                              return (
                                <Link key={r.id} href="/rotinas" className="turno-linha">
                                  <span>{r.nome}</span>
                                  <span className={feitos === r.itens.length ? "rotina-chip ok" : "rotina-chip"}>{feitos}/{r.itens.length}</span>
                                </Link>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div className="today-card">
                        <div className="today-card-header">
                          <div className="today-card-title">Checklists de hoje</div>
                          <Link href="/checklist" className="today-card-link">Ver todos</Link>
                        </div>
                        <div className="turno-lista">
                          {linhas.map((l) => (
                            <Link key={l.c.id} href={`/checklist/${l.c.id}?type=daily`} className="turno-linha">
                              <span className={`turno-marca ${l.state}`}>{l.state === "concluido" ? "✓" : ""}</span>
                              <span style={{ flex: 1, minWidth: 0 }}>
                                <span className="turno-linha-nome">{l.c.name}</span>
                                <span className="turno-linha-meta">
                                  {l.bloqueado
                                    ? `Termine primeiro: ${l.c.prerequisitosPendentes.join(", ")}`
                                    : l.state === "aguardando"
                                      ? `${l.total} itens${l.requiresPhoto > 0 ? ` · ${l.requiresPhoto} exigem foto` : ""}`
                                      : `${l.done}/${l.total} itens`}
                                </span>
                              </span>
                              <span className={`state-pill state-pill-${l.state}`}>{STATE_LABEL[l.state]}</span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    </>
                  );
                })()
              )}
            </>
          ) : null}

          {user.unitId && (
            <div className="today-card">
              <div className="today-card-header">
                <div>
                  <div className="today-card-title">Pendências herdadas</div>
                  <div className="today-card-subtitle">
                    Abertas no diário de bordo dos turnos anteriores
                  </div>
                </div>
                <Link href="/diario-de-bordo" className="today-card-link">
                  Ver diário
                </Link>
              </div>

              {pendencias.length === 0 ? (
                <p className="empty-state">Nenhuma pendência em aberto</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {pendencias.map((p) => {
                    const urgency = !p.prazo
                      ? ""
                      : p.prazo <= todayISO()
                        ? "urgent"
                        : "upcoming";
                    return (
                      <div key={p.id} className={`pendencia-item ${urgency}`}>
                        <div>
                          <div className="pendencia-item-title">{p.descricao}</div>
                          <div className="pendencia-item-meta">
                            {p.setor} ·{" "}
                            {new Date(`${p.shiftLogDate}T00:00:00`).toLocaleDateString("pt-BR")}
                            {p.responsavel ? ` · ${p.responsavel}` : ""}
                          </div>
                        </div>
                        <form action={resolvePendencia}>
                          <input type="hidden" name="id" value={p.id} />
                          <button type="submit" className="btn-tertiary">
                            Concluir
                          </button>
                        </form>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="hoje-column">
          {(canCreateAnomaly ||
            canSubmitRestoIngesta(user) ||
            canSubmitFilleting(user) ||
            canRequestRequisicao) && (
            <div className="today-card">
              <div className="today-card-title" style={{ marginBottom: 8 }}>
                Registrar agora
              </div>
              {canCreateAnomaly && (
                <Link href="/anomalias" className="quick-action-row">
                  Anomalia
                  <span className="quick-action-plus">+</span>
                </Link>
              )}
              {canRequestRequisicao && (
                <Link href="/requisicoes" className="quick-action-row">
                  Requisição
                  <span className="quick-action-plus">+</span>
                </Link>
              )}
              {canSubmitRestoIngesta(user) && (
                <Link href="/perdas?tab=resto" className="quick-action-row">
                  Resto ingesta
                  <span className="quick-action-plus">+</span>
                </Link>
              )}
              {canSubmitFilleting(user) && (
                <Link href="/perdas?tab=filetagem" className="quick-action-row">
                  Filetagem de pescado
                  <span className="quick-action-plus">+</span>
                </Link>
              )}
            </div>
          )}

          {canWriteShiftLog && (
            <div className="closing-card">
              <div className="today-card-title" style={{ marginBottom: 8 }}>
                Fechamento do turno
              </div>
              <p>Registre o diário de bordo ao final do turno para manter a próxima liderança informada.</p>
              <Link href="/diario-de-bordo" className="btn-primary btn-primary-block">
                Escrever diário de bordo
              </Link>
            </div>
          )}
        </div>
      </div>

      <h2 style={{ marginTop: 34, marginBottom: 16 }}>📊 Painel</h2>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 20 }}>
        <DateFilter date={painelDate} unit={rawUnit} action="/hoje" />
        {(isGestor || isRh) && <UnitFilter units={units} value={requestedUnitId} />}
      </div>

      {!isGestor && !isRh && user.unitId === null && (
        <p className="empty-state">
          Sua unidade ainda não foi definida. Peça a um Gestor para atribuir
          sua unidade no cadastro.
        </p>
      )}

      {missingChecklist.length > 0 && (
        <div className="alert-banner">
          <strong>
            ⚠️ {missingChecklist.length}{" "}
            {missingChecklist.length === 1 ? "pessoa ainda não fez" : "pessoas ainda não fizeram"}{" "}
            nenhum checklist {isPainelToday ? "hoje" : `em ${painelDateLabel}`}:
          </strong>{" "}
          {missingChecklist
            .map((u) => (u.unitName ? `${u.name} (${u.unitName})` : u.name))
            .join(", ")}
        </div>
      )}

      <div className="dashboard-grid">
        <div className="card">
          <h3>Checklists Totais</h3>
          <div className="value">{painelStats.totalChecklists}</div>
          <div className="subtitle">cadastrados</div>
        </div>
        <div className="card success">
          <h3>{isPainelToday ? "Concluídos Hoje" : "Concluídos"}</h3>
          <div className="value">{painelStats.completedToday}</div>
          <div className="subtitle">de {painelStats.totalChecklists}</div>
        </div>
        <div className="card warning">
          <h3>Em Andamento</h3>
          <div className="value">{painelStats.inProgress}</div>
          <div className="subtitle">pendentes</div>
        </div>
        <div className="card info">
          <h3>Taxa de Conformidade</h3>
          <div className="value">
            {painelStats.complianceRate === null ? "-" : `${painelStats.complianceRate}%`}
          </div>
          <div className="subtitle">{isPainelToday ? "mês atual" : `mês de ${painelDateLabel}`}</div>
        </div>
        <div className="card warning">
          <h3>🐟 Perda na Filetagem</h3>
          <div className="value">
            {filletingSummary.avgLossPercent === null
              ? "-"
              : `${filletingSummary.avgLossPercent.toFixed(1)}%`}
          </div>
          <div className="subtitle">média do {isPainelToday ? "mês atual" : `mês de ${painelDateLabel}`}</div>
        </div>
        <div className="card info">
          <h3>🍽️ Resto Ingesta</h3>
          <div className="value">
            {restoIngestaSummary.avgWastePerPersonKg === null
              ? "-"
              : `${restoIngestaSummary.avgWastePerPersonKg.toFixed(3)} kg`}
          </div>
          <div className="subtitle">
            desperdício médio por pessoa · {isPainelToday ? "mês atual" : `mês de ${painelDateLabel}`}
          </div>
        </div>
      </div>

      <h2 style={{ marginTop: 30, marginBottom: 20 }}>
        🏆 Ranking de Colaboradores ({isPainelToday ? "semana atual" : `semana de ${painelDateLabel}`})
      </h2>
      {ranking.length === 0 ? (
        <p className="empty-state">Nenhum checklist concluído ainda</p>
      ) : (
        <table className="ranking-table">
          <thead>
            <tr>
              <th>Posição</th>
              <th>Colaborador</th>
              <th>Unidade</th>
              <th>Checklists Completos</th>
              <th>Taxa de Conformidade</th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((row, idx) => (
              <tr key={row.name}>
                <td>
                  {MEDALS[idx] ?? "•"} {idx + 1}º
                </td>
                <td>{row.name}</td>
                <td>{row.unitName ?? "-"}</td>
                <td>{row.completions}</td>
                <td>{row.complianceRate}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

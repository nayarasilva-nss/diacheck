"use client";

import { useMemo, useState } from "react";
import {
  addAuditGroup,
  renameAuditGroup,
  deleteAuditGroup,
  addAuditItem,
  updateAuditItem,
  deleteAuditItem,
} from "@/lib/actions/audits";
import { DeleteButton } from "./DeleteButton";

type Item = { id: number; label: string; weight: number; howToVerify: string; responsible: string; appliesTo: string };
type Group = { id: number; name: string; items: Item[] };

const PESO: Record<number, string> = { 3: "Crítico", 2: "Maior", 1: "Menor" };

function Pesos({ id, valor }: { id: string; valor: number }) {
  return (
    <select id={id} name="weight" defaultValue={valor} aria-label="Peso">
      <option value={3}>Crítico (3)</option>
      <option value={2}>Maior (2)</option>
      <option value={1}>Menor (1)</option>
    </select>
  );
}

function PerguntaRow({ item }: { item: Item }) {
  const [editando, setEditando] = useState(false);

  if (!editando) {
    return (
      <div className="modelo-card compacto audit-pergunta">
        <div className="modelo-card-topo">
          <div className="modelo-card-titulo static">
            <span className={`modelo-badge ${item.weight === 3 ? "daily" : ""}`}>{PESO[item.weight] ?? item.weight}</span>
            <span className="modelo-nome audit-label">{item.label}</span>
          </div>
          <div className="list-item-actions">
            <button className="btn-small" type="button" onClick={() => setEditando(true)}>
              Editar
            </button>
            <DeleteButton action={deleteAuditItem} id={item.id} confirmText="Remover esse critério?" />
          </div>
        </div>
        {(item.responsible || item.appliesTo || item.howToVerify) && (
          <div className="modelo-badges sem-recuo">
            {item.responsible && <span className="modelo-badge">resp.: {item.responsible}</span>}
            {item.appliesTo && <span className="modelo-badge">vale para: {item.appliesTo}</span>}
            {item.howToVerify && <span className="modelo-badge">como verificar: {item.howToVerify}</span>}
          </div>
        )}
      </div>
    );
  }

  return (
    <form
      className="inline-form"
      action={async (fd) => {
        await updateAuditItem(fd);
        setEditando(false);
      }}
    >
      <input type="hidden" name="id" value={item.id} />
      <h4>Editar critério</h4>
      <div className="form-group">
        <label htmlFor={`auditLabel-${item.id}`}>Critério</label>
        <input id={`auditLabel-${item.id}`} name="label" defaultValue={item.label} />
      </div>
      <div className="form-group">
        <label htmlFor={`auditPeso-${item.id}`}>Peso</label>
        <Pesos id={`auditPeso-${item.id}`} valor={item.weight} />
      </div>
      <div className="form-group">
        <label htmlFor={`auditResp-${item.id}`}>Responsável</label>
        <input id={`auditResp-${item.id}`} name="responsible" defaultValue={item.responsible} />
      </div>
      <div className="form-group">
        <label htmlFor={`auditAplica-${item.id}`}>Vale para</label>
        <input id={`auditAplica-${item.id}`} name="appliesTo" defaultValue={item.appliesTo} />
      </div>
      <div className="form-group">
        <label htmlFor={`auditComo-${item.id}`}>Como verificar</label>
        <input id={`auditComo-${item.id}`} name="howToVerify" defaultValue={item.howToVerify} />
      </div>
      <div className="inline-form-buttons">
        <button type="button" className="btn-cancel" onClick={() => setEditando(false)}>
          Cancelar
        </button>
        <button className="btn-save" type="submit">
          Salvar
        </button>
      </div>
    </form>
  );
}

function GrupoCabecalho({ group }: { group: Group }) {
  const [renomeando, setRenomeando] = useState(false);
  const [novaPergunta, setNovaPergunta] = useState(false);

  return (
    <div className="audit-grupo-acoes">
      {renomeando ? (
        <form
          className="audit-renomear"
          action={async (fd) => {
            await renameAuditGroup(fd);
            setRenomeando(false);
          }}
        >
          <input type="hidden" name="id" value={group.id} />
          <input id={`auditGrupoNome-${group.id}`} name="name" defaultValue={group.name} aria-label="Nome do grupo" />
          <button className="btn-small" type="submit">Salvar</button>
          <button className="btn-small" type="button" onClick={() => setRenomeando(false)}>Cancelar</button>
        </form>
      ) : (
        <div className="list-item-actions">
          <button className="btn-small" type="button" onClick={() => setNovaPergunta((v) => !v)}>
            {novaPergunta ? "Fechar" : "+ Pergunta"}
          </button>
          <button className="btn-small" type="button" onClick={() => setRenomeando(true)}>
            Renomear grupo
          </button>
          <DeleteButton
            action={deleteAuditGroup}
            id={group.id}
            confirmText={`Remover o grupo "${group.name}" e todas as ${group.items.length} perguntas dele?`}
          />
        </div>
      )}
      {novaPergunta && (
        <form
          className="inline-form"
          action={async (fd) => {
            await addAuditItem(fd);
            setNovaPergunta(false);
          }}
        >
          <input type="hidden" name="groupId" value={group.id} />
          <h4>Nova pergunta em {group.name}</h4>
          <div className="form-group">
            <label htmlFor={`auditNovaLabel-${group.id}`}>Critério</label>
            <input id={`auditNovaLabel-${group.id}`} name="label" placeholder="O que será avaliado" />
          </div>
          <div className="form-group">
            <label htmlFor={`auditNovaPeso-${group.id}`}>Peso</label>
            <Pesos id={`auditNovaPeso-${group.id}`} valor={1} />
          </div>
          <div className="inline-form-buttons">
            <button type="button" className="btn-cancel" onClick={() => setNovaPergunta(false)}>
              Cancelar
            </button>
            <button className="btn-save" type="submit">Adicionar</button>
          </div>
        </form>
      )}
    </div>
  );
}

export function AuditoriaBoard({ groups }: { groups: Group[] }) {
  const [busca, setBusca] = useState("");
  const [peso, setPeso] = useState(0);
  const [criando, setCriando] = useState(false);

  const filtrando = Boolean(busca || peso);
  const total = groups.reduce((n, g) => n + g.items.length, 0);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return groups
      .map((g) => ({
        ...g,
        mostrados: g.items.filter(
          (i) =>
            (!peso || i.weight === peso) &&
            (!q ||
              i.label.toLowerCase().includes(q) ||
              i.howToVerify.toLowerCase().includes(q) ||
              i.responsible.toLowerCase().includes(q) ||
              i.appliesTo.toLowerCase().includes(q) ||
              g.name.toLowerCase().includes(q)),
        ),
      }))
      .filter((g) => !filtrando || g.mostrados.length > 0);
  }, [groups, busca, peso, filtrando]);

  const achadas = visiveis.reduce((n, g) => n + g.mostrados.length, 0);

  return (
    <div className="modelos-board">
      <div className="modelos-toolbar">
        <input
          id="auditoriaBusca"
          type="search"
          className="modelos-busca"
          placeholder="Buscar pergunta, responsável ou grupo"
          aria-label="Buscar pergunta, responsável ou grupo"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <div className="filter-pills" role="group" aria-label="Peso">
          {([[0, "Todos"], [3, "Críticos"], [2, "Maiores"], [1, "Menores"]] as const).map(([k, l]) => (
            <button key={k} type="button" className={`pill${peso === k ? " active" : ""}`} aria-pressed={peso === k} onClick={() => setPeso(k)}>
              {l}
            </button>
          ))}
        </div>
        <button className="btn-add modelos-novo" type="button" onClick={() => setCriando((v) => !v)}>
          {criando ? "Fechar" : "+ Novo grupo"}
        </button>
      </div>

      {criando && (
        <form
          className="inline-form"
          action={async (fd) => {
            await addAuditGroup(fd);
            setCriando(false);
          }}
        >
          <h4>Novo grupo</h4>
          <div className="form-group">
            <label htmlFor="newAuditGroup">Nome</label>
            <input id="newAuditGroup" name="name" placeholder="Ex: Instalações" />
          </div>
          <div className="inline-form-buttons">
            <button type="button" className="btn-cancel" onClick={() => setCriando(false)}>
              Cancelar
            </button>
            <button className="btn-save" type="submit">Adicionar grupo</button>
          </div>
        </form>
      )}

      <p className="items-count modelos-resumo">
        {filtrando ? `${achadas} de ${total} perguntas` : `${groups.length} ${groups.length === 1 ? "grupo" : "grupos"} · ${total} perguntas`}
        {filtrando && (
          <button type="button" className="link-btn" onClick={() => { setBusca(""); setPeso(0); }}>
            Limpar filtros
          </button>
        )}
      </p>
      <p className="items-count">
        Grupos e perguntas das auditorias de unidade. Mudanças valem para as próximas auditorias; as já feitas não são alteradas.
      </p>

      {visiveis.length === 0 && (
        <div className="today-card">
          <p className="items-count">{groups.length === 0 ? "Nenhum grupo ainda. Crie o primeiro em “+ Novo grupo”." : "Nenhuma pergunta com esses filtros."}</p>
        </div>
      )}

      {visiveis.map((g, i) => (
        <details className="modelos-grupo grupo-recolhivel" key={`${g.id}-${filtrando}`} open={filtrando || visiveis.length <= 4 || i === 0}>
          <summary className="modelos-grupo-titulo">
            {g.name} <span>{filtrando ? `${g.mostrados.length} de ${g.items.length}` : g.items.length}</span>
            {g.items.some((x) => x.weight === 3) && <span className="modelo-badge">{g.items.filter((x) => x.weight === 3).length} críticas</span>}
          </summary>
          <GrupoCabecalho group={g} />
          {g.mostrados.map((item) => (
            <PerguntaRow key={item.id} item={item} />
          ))}
          {g.items.length === 0 && <p className="items-count">Grupo sem perguntas. Use “+ Pergunta”.</p>}
        </details>
      ))}
    </div>
  );
}

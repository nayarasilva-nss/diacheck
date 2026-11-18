"use client";

import { useMemo, useState } from "react";
import { UserRow } from "./UserRow";
import { AddUserForm } from "./AddUserForm";

type Option = { id: number; name: string };
type Usuario = {
  id: number;
  name: string;
  username: string;
  profile: string;
  unitId: number | null;
  unitName: string | null;
  jobFunctionId: number | null;
  jobFunctionName: string | null;
  folgaDias: number[];
  requisicaoUnidadesExtras: number[];
  checklistObrigatorio: boolean;
};

const PERFIS: [string, string][] = [
  ["gestor", "Gestor"],
  ["gerente", "Gerente"],
  ["lider", "Líder"],
  ["rh", "RH"],
  ["master", "Master"],
];
const SEM_UNIDADE = "Sem unidade";

export function UsuariosBoard({
  usuarios,
  units,
  jobFunctions,
}: {
  usuarios: Usuario[];
  units: Option[];
  jobFunctions: Option[];
}) {
  const [busca, setBusca] = useState("");
  const [unidade, setUnidade] = useState("");
  const [funcao, setFuncao] = useState("");
  const [perfil, setPerfil] = useState("");
  const [criando, setCriando] = useState(false);

  const grupos = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const filtrados = usuarios.filter((u) => {
      if (perfil && u.profile !== perfil) return false;
      if (unidade === "sem" ? u.unitId !== null : unidade && String(u.unitId) !== unidade) return false;
      if (funcao === "sem" ? u.jobFunctionId !== null : funcao && String(u.jobFunctionId) !== funcao) return false;
      return !q || u.name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q);
    });
    const mapa = new Map<string, Usuario[]>();
    for (const u of filtrados) {
      const k = u.unitName ?? SEM_UNIDADE;
      mapa.set(k, [...(mapa.get(k) ?? []), u]);
    }
    return {
      total: filtrados.length,
      lista: [...mapa.entries()].sort(([a], [b]) =>
        a === SEM_UNIDADE ? 1 : b === SEM_UNIDADE ? -1 : a.localeCompare(b, "pt-BR"),
      ),
    };
  }, [usuarios, busca, unidade, funcao, perfil]);

  const filtrando = Boolean(busca || unidade || funcao || perfil);

  return (
    <div className="modelos-board">
      <div className="modelos-toolbar">
        <input
          id="usuariosBusca"
          type="search"
          className="modelos-busca"
          placeholder="Buscar por nome ou usuário"
          aria-label="Buscar por nome ou usuário"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <select id="usuariosUnidade" aria-label="Filtrar por unidade" value={unidade} onChange={(e) => setUnidade(e.target.value)}>
          <option value="">Todas as unidades</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
          <option value="sem">Sem unidade</option>
        </select>
        <select id="usuariosFuncao" aria-label="Filtrar por função" value={funcao} onChange={(e) => setFuncao(e.target.value)}>
          <option value="">Todas as funções</option>
          {jobFunctions.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
          <option value="sem">Sem função</option>
        </select>
        <select id="usuariosPerfil" aria-label="Filtrar por perfil" value={perfil} onChange={(e) => setPerfil(e.target.value)}>
          <option value="">Todos os perfis</option>
          {PERFIS.map(([k, l]) => (
            <option key={k} value={k}>{l}</option>
          ))}
        </select>
        <button className="btn-add modelos-novo" type="button" onClick={() => setCriando((v) => !v)}>
          {criando ? "Fechar" : "+ Novo usuário"}
        </button>
      </div>

      {criando && <AddUserForm units={units} jobFunctions={jobFunctions} startOpen onDone={() => setCriando(false)} />}

      <p className="items-count modelos-resumo">
        {filtrando ? `${grupos.total} de ${usuarios.length} usuários` : `${usuarios.length} usuários`}
        {filtrando && (
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              setBusca("");
              setUnidade("");
              setFuncao("");
              setPerfil("");
            }}
          >
            Limpar filtros
          </button>
        )}
      </p>

      {grupos.lista.length === 0 && (
        <div className="today-card">
          <p className="items-count">{usuarios.length === 0 ? "Nenhum usuário ainda." : "Nenhum usuário com esses filtros."}</p>
        </div>
      )}

      {grupos.lista.map(([nome, lista]) => (
        <section className="modelos-grupo" key={nome} aria-label={nome}>
          <h3 className="modelos-grupo-titulo">
            {nome} <span>{lista.length}</span>
          </h3>
          {lista.map((u) => (
            <UserRow key={u.id} user={u} units={units} jobFunctions={jobFunctions} />
          ))}
        </section>
      ))}
    </div>
  );
}

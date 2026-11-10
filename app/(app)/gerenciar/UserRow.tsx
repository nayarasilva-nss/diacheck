"use client";

import { useState, useTransition } from "react";
import { updateUser, deleteUser } from "@/lib/actions/manage";
import { DeleteButton } from "./DeleteButton";

const PROFILE_LABELS: Record<string, string> = {
  gestor: "Gestor",
  gerente: "Gerente",
  lider: "Líder",
  rh: "RH",
  master: "Master",
};

type Option = { id: number; name: string };

type User = {
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

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function UserRow({
  user,
  units,
  jobFunctions,
}: {
  user: User;
  units: Option[];
  jobFunctions: Option[];
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  if (!editing) {
    return (
      <div className="list-item">
        <div className="info">
          <h4>{user.name}</h4>
          <p>
            @{user.username} • {PROFILE_LABELS[user.profile] ?? user.profile}
            {" • "}
            {user.unitName ?? "Sem unidade"}
            {" • "}
            {user.jobFunctionName ?? "Sem função"}
            {!user.checklistObrigatorio && " • sem checklist obrigatório"}
            {user.requisicaoUnidadesExtras.length > 0 && ` • requisições também de ${units.filter((u) => user.requisicaoUnidadesExtras.includes(u.id)).map((u) => u.name).join(", ")}`}
          </p>
        </div>
        <div className="list-item-actions">
          {user.profile !== "master" && (
            <>
              <button
                className="btn-small"
                type="button"
                onClick={() => setEditing(true)}
              >
                Editar
              </button>
              <DeleteButton
                action={deleteUser}
                id={user.id}
                confirmText={`Deletar o usuário "${user.name}"?`}
              />
            </>
          )}
        </div>
      </div>
    );
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await updateUser(undefined, fd);
      if (result?.error) {
        setError(result.error);
      } else {
        setError(undefined);
        setEditing(false);
      }
    });
  }

  return (
    <form className="inline-form" onSubmit={handleSubmit}>
      <input type="hidden" name="id" value={user.id} />
      <h4>Editar Usuário</h4>
      <div className="form-group">
        <label htmlFor={`editUserName-${user.id}`}>Nome</label>
        <input
          id={`editUserName-${user.id}`}
          name="name"
          defaultValue={user.name}
        />
      </div>
      <div className="form-group">
        <label htmlFor={`editUsername-${user.id}`}>Usuário (login)</label>
        <input
          id={`editUsername-${user.id}`}
          name="username"
          defaultValue={user.username}
          autoComplete="off"
        />
      </div>
      <div className="form-group">
        <label htmlFor={`editUserProfile-${user.id}`}>Perfil</label>
        <select
          id={`editUserProfile-${user.id}`}
          name="profile"
          defaultValue={user.profile}
        >
          <option value="lider">Líder</option>
          <option value="gerente">Gerente</option>
          <option value="gestor">Gestor</option>
          <option value="rh">RH</option>
        </select>
      </div>
      <div className="form-group">
        <label htmlFor={`editUserUnit-${user.id}`}>Unidade</label>
        <select
          id={`editUserUnit-${user.id}`}
          name="unitId"
          defaultValue={user.unitId ?? ""}
        >
          <option value="">Sem unidade</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <label htmlFor={`editUserJobFunction-${user.id}`}>Função</label>
        <select
          id={`editUserJobFunction-${user.id}`}
          name="jobFunctionId"
          defaultValue={user.jobFunctionId ?? ""}
        >
          <option value="">Sem função</option>
          {jobFunctions.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </div>
      {user.profile !== "rh" && (
        <div className="form-group">
          <label htmlFor={`semChecklist-${user.id}`} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" id={`semChecklist-${user.id}`} name="semChecklist" defaultChecked={!user.checklistObrigatorio} />
            Sem checklists obrigatórios
          </label>
          <p className="items-count">
            Não aparece em atraso, em &quot;sem checklist hoje&quot; nem nos indicadores, e não vê o card &quot;Checklists em atraso&quot; na
            tela Hoje. Só passa a contar nos indicadores se a pessoa começar um checklist (por exemplo, ao cobrir alguém na operação).
          </p>
        </div>
      )}
      {(user.profile === "gerente" || user.profile === "lider") && (
        <div className="form-group">
          <label>Requisições de outras unidades</label>
          <p className="items-count" style={{ marginBottom: 8 }}>
            Além da própria unidade, a pessoa também vê, confere e (sendo gerente) confirma o recebimento das requisições destas unidades. Vale para quem confere requisições: gerentes e líderes de Delivery ou de Estoque/Produção.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {units.map((u) => (
              <label key={u.id} htmlFor={`reqUn-${user.id}-${u.id}`} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <input type="checkbox" id={`reqUn-${user.id}-${u.id}`} name="reqUnidades" value={u.id} defaultChecked={user.requisicaoUnidadesExtras.includes(u.id)} />
                {u.name}
              </label>
            ))}
          </div>
        </div>
      )}
      {(user.profile === "gerente" || user.profile === "lider") && (
        <div className="form-group">
          <label>Folgas na semana (escala)</label>
          <p className="items-count" style={{ marginBottom: 8 }}>
            Nesses dias a pessoa não é cobrada nos checklists, nos alertas de atraso e nos indicadores. Só vale a partir da data de início da escala; até lá a folga é no domingo para todos.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {DIAS.map((dia, i) => (
              <label key={i} htmlFor={`folga-${user.id}-${i}`} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <input type="checkbox" id={`folga-${user.id}-${i}`} name="folgaDias" value={i} defaultChecked={user.folgaDias.includes(i)} />
                {dia}
              </label>
            ))}
          </div>
        </div>
      )}
      <div className="form-group">
        <label htmlFor={`editUserPassword-${user.id}`}>Senha</label>
        <input
          id={`editUserPassword-${user.id}`}
          name="password"
          type="password"
          placeholder="Deixe em branco para manter"
        />
      </div>
      {error && <p className="login-error">{error}</p>}
      <div className="inline-form-buttons">
        <button
          type="button"
          className="btn-cancel"
          onClick={() => setEditing(false)}
        >
          Cancelar
        </button>
        <button className="btn-save" type="submit" disabled={isPending}>
          Salvar
        </button>
      </div>
    </form>
  );
}

"use client";

import { useRef, useState, useTransition } from "react";
import { createUser } from "@/lib/actions/manage";

type Option = { id: number; name: string };

export function AddUserForm({
  units,
  jobFunctions,
  startOpen = false,
  onDone,
}: {
  startOpen?: boolean;
  onDone?: () => void;
  units: Option[];
  jobFunctions: Option[];
}) {
  const [open, setOpen] = useState(startOpen);
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  if (!open) {
    return (
      <button className="btn-add" type="button" onClick={() => setOpen(true)}>
        + Adicionar Usuário
      </button>
    );
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await createUser(undefined, fd);
      if (result?.error) {
        setError(result.error);
      } else {
        setError(undefined);
        setOpen(false);
        formRef.current?.reset();
        onDone?.();
      }
    });
  }

  return (
    <form className="inline-form" ref={formRef} onSubmit={handleSubmit}>
      <h4>Adicionar Usuário</h4>
      <div className="form-group">
        <label htmlFor="newUserName">Nome</label>
        <input id="newUserName" name="name" placeholder="Nome do usuário" />
      </div>
      <div className="form-group">
        <label htmlFor="newUsername">Usuário (login)</label>
        <input
          id="newUsername"
          name="username"
          placeholder="Ex: joao.silva"
          autoComplete="off"
        />
      </div>
      <div className="form-group">
        <label htmlFor="newUserProfile">Perfil</label>
        <select id="newUserProfile" name="profile" defaultValue="lider">
          <option value="lider">Líder</option>
          <option value="gerente">Gerente</option>
          <option value="gestor">Gestor</option>
          <option value="rh">RH</option>
        </select>
      </div>
      <div className="form-group">
        <label htmlFor="newUserUnit">Unidade</label>
        <select id="newUserUnit" name="unitId" defaultValue="">
          <option value="">Sem unidade</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <label htmlFor="newUserJobFunction">Função</label>
        <select id="newUserJobFunction" name="jobFunctionId" defaultValue="">
          <option value="">Sem função</option>
          {jobFunctions.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <label htmlFor="newUserPassword">Senha</label>
        <input
          id="newUserPassword"
          name="password"
          type="password"
          placeholder="Senha"
        />
      </div>
      {error && <p className="login-error">{error}</p>}
      <div className="inline-form-buttons">
        <button
          type="button"
          className="btn-cancel"
          onClick={() => { setOpen(false); onDone?.(); }}
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

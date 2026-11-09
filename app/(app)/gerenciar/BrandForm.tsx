"use client";

import { useState, useTransition } from "react";
import { updateOrganizationBrand } from "@/lib/actions/organizations";

type Organization = {
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
};

export function BrandForm({ organization }: { organization: Organization }) {
  const [error, setError] = useState<string | undefined>();
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await updateOrganizationBrand(undefined, fd);
      if (result?.error) {
        setError(result.error);
        setSaved(false);
      } else {
        setError(undefined);
        setSaved(true);
      }
    });
  }

  return (
    <form className="inline-form" onSubmit={handleSubmit}>
      <h4>Marca da empresa</h4>
      <div className="form-group">
        <label htmlFor="brandName">Nome</label>
        <input id="brandName" name="name" defaultValue={organization.name} required />
      </div>
      <div className="form-group">
        <label htmlFor="brandLogoUrl">URL da logo</label>
        <input
          id="brandLogoUrl"
          name="logoUrl"
          type="text"
          placeholder="https://.../logo.png"
          defaultValue={organization.logoUrl ?? ""}
        />
      </div>
      <div className="form-group">
        <label htmlFor="brandColor">Cor principal</label>
        <input
          id="brandColor"
          name="primaryColor"
          type="color"
          defaultValue={organization.primaryColor ?? "#1b9aaa"}
          style={{ height: 40, padding: 2 }}
        />
      </div>
      {error && <p className="login-error">{error}</p>}
      {saved && !error && <p className="items-count">Marca atualizada.</p>}
      <div className="inline-form-buttons">
        <button className="btn-save" type="submit" disabled={isPending}>
          {isPending ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </form>
  );
}

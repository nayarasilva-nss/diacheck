"use client";

import { useState, useTransition } from "react";
import { updateOrganizationBrand } from "@/lib/actions/organizations";
import { resolveBrandColors } from "@/lib/branding";

type Organization = {
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
};

const PADRAO = "#1b9aaa";
const SUGESTOES = ["#1b9aaa", "#d4382c", "#e8710a", "#2f7d4f", "#2457c5", "#6b3fa0", "#1f2937"];
const HEX = /^#[0-9a-fA-F]{6}$/;

export function BrandForm({ organization }: { organization: Organization }) {
  const inicial = {
    name: organization.name,
    logoUrl: organization.logoUrl ?? "",
    primaryColor: organization.primaryColor ?? "",
  };
  const [name, setName] = useState(inicial.name);
  const [logoUrl, setLogoUrl] = useState(inicial.logoUrl);
  const [cor, setCor] = useState(inicial.primaryColor);
  const [logoFalhou, setLogoFalhou] = useState(false);
  const [salvo, setSalvo] = useState(inicial);
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  const corValida = cor === "" || HEX.test(cor);
  const mudou = name !== salvo.name || logoUrl !== salvo.logoUrl || cor !== salvo.primaryColor;
  const brand = resolveBrandColors(corValida ? cor : salvo.primaryColor);
  const mostrarLogo = logoUrl.trim() !== "" && !logoFalhou;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData();
    fd.set("name", name);
    fd.set("logoUrl", logoUrl);
    fd.set("primaryColor", cor);
    startTransition(async () => {
      const result = await updateOrganizationBrand(undefined, fd);
      if (result?.error) {
        setError(result.error);
      } else {
        setError(undefined);
        setSalvo({ name, logoUrl, primaryColor: cor });
      }
    });
  }

  return (
    <div className="marca-layout">
      <form className="inline-form" onSubmit={handleSubmit}>
        <h4>Marca da empresa</h4>
        <p className="items-count" style={{ marginBottom: 14 }}>
          Nome, logo e cor usados no menu, nos PDFs de checklist e requisição e no visual do sistema para quem entra na sua empresa.
        </p>

        <div className="form-group">
          <label htmlFor="brandName">Nome</label>
          <input id="brandName" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>

        <div className="form-group">
          <label htmlFor="brandLogoUrl">Endereço da logo</label>
          <input
            id="brandLogoUrl"
            type="text"
            placeholder="https://.../logo.png"
            value={logoUrl}
            onChange={(e) => {
              setLogoUrl(e.target.value);
              setLogoFalhou(false);
            }}
          />
          {logoUrl.trim() !== "" && logoFalhou && (
            <p className="login-error">Não consegui carregar essa imagem. Confira o endereço.</p>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="brandColorHex">Cor principal</label>
          <div className="marca-cor">
            <input
              id="brandColor"
              type="color"
              aria-label="Escolher cor"
              value={corValida && cor ? cor : PADRAO}
              onChange={(e) => setCor(e.target.value)}
            />
            <input
              id="brandColorHex"
              type="text"
              value={cor}
              placeholder={`${PADRAO} (padrão)`}
              maxLength={7}
              onChange={(e) => setCor(e.target.value.startsWith("#") || e.target.value === "" ? e.target.value : `#${e.target.value}`)}
              aria-invalid={!corValida}
            />
            <button type="button" className="btn-small" onClick={() => setCor("")} disabled={cor === ""}>
              Usar a cor padrão
            </button>
          </div>
          <div className="marca-sugestoes" role="group" aria-label="Sugestões de cor">
            {SUGESTOES.map((c) => (
              <button
                key={c}
                type="button"
                className={`marca-amostra${cor.toLowerCase() === c ? " ativa" : ""}`}
                style={{ background: c }}
                aria-label={`Usar ${c}`}
                onClick={() => setCor(c)}
              />
            ))}
          </div>
          {!corValida && <p className="login-error">Use o formato #RRGGBB, por exemplo #1b9aaa.</p>}
        </div>

        {error && <p className="login-error">{error}</p>}
        {!mudou && !error && salvo !== inicial && <p className="items-count">Marca atualizada.</p>}
        <div className="inline-form-buttons">
          <button
            type="button"
            className="btn-cancel"
            disabled={!mudou}
            onClick={() => {
              setName(salvo.name);
              setLogoUrl(salvo.logoUrl);
              setCor(salvo.primaryColor);
              setLogoFalhou(false);
            }}
          >
            Desfazer
          </button>
          <button className="btn-save" type="submit" disabled={isPending || !mudou || !corValida}>
            {isPending ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>

      <aside
        className="marca-previa"
        aria-label="Prévia"
        style={{ "--p": brand.red, "--p-deep": brand.redDeep, "--p-tint": brand.tint, "--p-on": brand.onTint } as React.CSSProperties}
      >
        <div className="marca-previa-titulo">Prévia{mudou ? " (ainda não salva)" : ""}</div>
        <div className="marca-previa-menu">
          {mostrarLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" onError={() => setLogoFalhou(true)} />
          ) : (
            <span className="marca-inicial">{(name.trim()[0] ?? "?").toUpperCase()}</span>
          )}
          <strong>{name.trim() || "Nome da empresa"}</strong>
        </div>
        <div className="marca-previa-corpo">
          <span className="marca-previa-pill">Operação</span>
          <div className="marca-previa-barra"><div /></div>
          <button type="button" className="marca-previa-botao" tabIndex={-1}>Concluir checklist</button>
          <span className="marca-previa-selo">Diário · 4 tarefas</span>
        </div>
        <div className="marca-previa-pdf">
          <div className="marca-previa-pdf-topo" />
          <p>Cabeçalho dos PDFs</p>
        </div>
      </aside>
    </div>
  );
}

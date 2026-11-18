"use client";

import { useMemo, useState } from "react";
import { CatalogItemRow } from "./CatalogItemRow";
import { CategoryRow } from "./CategoryRow";
import { AddCatalogItemForm } from "./AddCatalogItemForm";
import { AddCategoryForm } from "./AddCategoryForm";

type Categoria = { id: number; name: string; orderDays: number[] };
type Produto = { id: number; name: string; unitMeasure: string; categoryId: number | null; categoryName: string | null };

const SEM_CATEGORIA = "Sem categoria";
const PAGINA = 40;

export function CatalogoBoard({ categorias, produtos }: { categorias: Categoria[]; produtos: Produto[] }) {
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("");
  const [criandoProduto, setCriandoProduto] = useState(false);
  const [criandoCategoria, setCriandoCategoria] = useState(false);
  const [verCategorias, setVerCategorias] = useState(false);
  const [limite, setLimite] = useState<Record<string, number>>({});

  const grupos = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const filtrados = produtos.filter((p) => {
      if (categoria === "sem" ? p.categoryId !== null : categoria && String(p.categoryId) !== categoria) return false;
      return !q || p.name.toLowerCase().includes(q);
    });
    const mapa = new Map<string, Produto[]>();
    for (const p of filtrados) {
      const k = p.categoryName ?? SEM_CATEGORIA;
      mapa.set(k, [...(mapa.get(k) ?? []), p]);
    }
    return {
      total: filtrados.length,
      lista: [...mapa.entries()].sort(([a], [b]) =>
        a === SEM_CATEGORIA ? 1 : b === SEM_CATEGORIA ? -1 : a.localeCompare(b, "pt-BR"),
      ),
    };
  }, [produtos, busca, categoria]);

  const filtrando = Boolean(busca || categoria);
  // Com busca ou filtro, todos os grupos abrem; sem, só o primeiro (catálogo grande).
  const abrirTodos = filtrando || grupos.lista.length <= 3;

  return (
    <div className="modelos-board">
      <div className="modelos-toolbar">
        <input
          id="catalogoBusca"
          type="search"
          className="modelos-busca"
          placeholder="Buscar produto"
          aria-label="Buscar produto"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <select id="catalogoCategoria" aria-label="Filtrar por categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          <option value="">Todas as categorias</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
          <option value="sem">Sem categoria</option>
        </select>
        <button className="btn-small" type="button" aria-expanded={verCategorias} onClick={() => setVerCategorias((v) => !v)}>
          Categorias · {categorias.length}
        </button>
        <button className="btn-add modelos-novo" type="button" onClick={() => setCriandoProduto((v) => !v)}>
          {criandoProduto ? "Fechar" : "+ Novo produto"}
        </button>
      </div>

      {criandoProduto && (
        <AddCatalogItemForm categories={categorias} startOpen onDone={() => setCriandoProduto(false)} />
      )}

      {verCategorias && (
        <section className="modelos-grupo" aria-label="Categorias">
          <h3 className="modelos-grupo-titulo">
            Categorias <span>{categorias.length}</span>
            <button type="button" className="link-btn" onClick={() => setCriandoCategoria((v) => !v)}>
              {criandoCategoria ? "Fechar" : "+ Nova categoria"}
            </button>
          </h3>
          {criandoCategoria && <AddCategoryForm startOpen onDone={() => setCriandoCategoria(false)} />}
          {categorias.map((c) => (
            <CategoryRow key={c.id} category={c} />
          ))}
        </section>
      )}

      <p className="items-count modelos-resumo">
        {filtrando ? `${grupos.total} de ${produtos.length} produtos` : `${produtos.length} produtos`}
        {filtrando && (
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              setBusca("");
              setCategoria("");
            }}
          >
            Limpar filtros
          </button>
        )}
      </p>

      {grupos.lista.length === 0 && (
        <div className="today-card">
          <p className="items-count">{produtos.length === 0 ? "Nenhum produto ainda." : "Nenhum produto com esses filtros."}</p>
        </div>
      )}

      {grupos.lista.map(([nome, lista], i) => (
        <details className="modelos-grupo grupo-recolhivel" key={`${nome}-${abrirTodos}`} open={abrirTodos || i === 0}>
          <summary className="modelos-grupo-titulo">
            {nome} <span>{lista.length}</span>
          </summary>
          {lista.slice(0, limite[nome] ?? PAGINA).map((p) => (
            <CatalogItemRow key={p.id} item={p} categories={categorias} />
          ))}
          {lista.length > (limite[nome] ?? PAGINA) && (
            <button
              type="button"
              className="btn-small"
              onClick={() => setLimite((l) => ({ ...l, [nome]: (l[nome] ?? PAGINA) + PAGINA * 2 }))}
            >
              Mostrar mais ({lista.length - (limite[nome] ?? PAGINA)} restantes)
            </button>
          )}
        </details>
      ))}
    </div>
  );
}

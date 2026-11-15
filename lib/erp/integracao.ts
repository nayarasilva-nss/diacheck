import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { catalogItems, jobFunctions, organizations, requisicaoItens, requisicoes, units, users } from "@/lib/db/schema";
import { checklistDayForInstant } from "@/lib/date-utils";
import type { ItemErp } from "./sugestao";

/**
 * Ligação com o ERP Kenkyo. A requisição acompanha lá a fase daqui
 * (POST /api/requisicoes com "situacao"): lançada ou editada entra como
 * aberta; conferida vira a baixa de estoque, pelo custo médio; cancelada ou
 * excluída é cancelada lá. Nada aqui depende do ERP: se ele estiver fora do
 * ar, a requisição fica "pendente" e vai na próxima vez.
 *
 * Configuração (fase multi-empresa): cada empresa tem a sua ligação
 * (organizations.erp_api_url / erp_api_token, Gerenciar › ERP). Sem a dela,
 * cai nas env vars do servidor (ERP_API_URL / ERP_API_TOKEN) — o jeito antigo,
 * que a Kenkyo segue usando. Sem nenhuma das duas, a empresa não tem ERP:
 * os módulos de ERP somem e as requisições ficam pendentes aqui.
 */

export type LigacaoErp = { url: string; token: string };

/**
 * A ligação da empresa: o que está cadastrado nela, ou as env vars do
 * servidor (jeito antigo, uma empresa só). Null = esta empresa não tem ERP.
 */
export async function ligacaoDaEmpresa(organizationId: number | null | undefined): Promise<LigacaoErp | null> {
  if (organizationId) {
    const [org] = await db
      .select({ url: organizations.erpApiUrl, token: organizations.erpApiToken })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);
    if (org?.url && org.token) return { url: org.url, token: org.token };
  }
  if (process.env.ERP_API_URL && process.env.ERP_API_TOKEN) {
    return { url: process.env.ERP_API_URL, token: process.env.ERP_API_TOKEN };
  }
  return null;
}

/** Sem empresa informada (caminhos do jeito antigo), vale o servidor. */
export type ErpCatalogo = {
  itens: ItemErp[];
  setores?: string[];
  unidades: { cnpj: string; nome: string; tipo: string }[];
  locais: { id: number; nome: string; tipo: string; unidade_cnpj: string; unidade: string }[];
};

export function erpConfigurado(): boolean {
  return Boolean(process.env.ERP_API_URL && process.env.ERP_API_TOKEN);
}

export async function chamarErp(caminho: string, init?: RequestInit, ligacao?: LigacaoErp | null): Promise<Response> {
  const l = ligacao ?? (await ligacaoDaEmpresa(null));
  if (!l) throw new Error("A ligação com o ERP não está configurada.");
  const base = l.url.replace(/\/+$/, "");
  return fetch(`${base}${caminho}`, {
    ...init,
    cache: "no-store",
    signal: init?.signal ?? AbortSignal.timeout(15_000),
    headers: { Authorization: `Bearer ${l.token}`, "Content-Type": "application/json" },
  });
}

/** Itens, empresas e locais de estoque do ERP, para a tela de ligação. */
export async function lerCatalogoErp(organizationId?: number): Promise<ErpCatalogo> {
  const ligacao = await ligacaoDaEmpresa(organizationId ?? null);
  if (!ligacao) throw new Error("A ligação com o ERP não está configurada para esta empresa (Gerenciar › ERP).");
  let resposta: Response;
  try {
    resposta = await chamarErp("/api/catalogo", undefined, ligacao);
  } catch {
    throw new Error("Não foi possível falar com o ERP agora. Tente de novo em instantes.");
  }
  if (resposta.status === 401) throw new Error("O ERP recusou a chave da ligação (ERP_API_TOKEN diferente do API_REQUISICOES_TOKEN do ERP).");
  if (!resposta.ok) throw new Error(`O ERP respondeu com erro ${resposta.status}.`);
  return (await resposta.json()) as ErpCatalogo;
}

/**
 * Os setores que pedem cada item do ERP (código → setores), para a tela de
 * requisição mostrar a cada função só o que é do setor dela. Guardado em
 * cache por 5 minutos e com tempo curto: se o ERP não responder, devolve
 * null e a requisição mostra o catálogo inteiro — nunca trava o pedido.
 */
export async function setoresDosItensErp(organizationId: number): Promise<Map<string, string[]> | null> {
  const catalogo = await catalogoErpEmCache(organizationId);
  return catalogo ? new Map(catalogo.itens.map((i) => [i.codigo, i.setores ?? []])) : null;
}

/** O catálogo do ERP guardado por 5 minutos, com tempo curto; null se o ERP não responder. */
async function catalogoErpEmCache(organizationId: number): Promise<ErpCatalogo | null> {
  const ligacao = await ligacaoDaEmpresa(organizationId);
  if (!ligacao) return null;
  try {
    const resposta = await fetch(`${ligacao.url.replace(/\/+$/, "")}/api/catalogo`, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(5_000),
      headers: { Authorization: `Bearer ${ligacao.token}` },
    });
    if (!resposta.ok) return null;
    return (await resposta.json()) as ErpCatalogo;
  } catch {
    return null;
  }
}

export type Destino = "emporio" | "compras";

/**
 * Para onde vai cada item da requisição externa, pelo que o ERP diz de como
 * o item chega na unidade: "central" vem do Empório; "compra_direta" vira
 * solicitação de compra. Item avulso (fora do catálogo) só pode ir por
 * Compras; produto ainda sem item do ERP ligado segue pelo Empório, como
 * sempre foi. Sem resposta do ERP: null (decide no envio).
 */
export function destinoDoItem(
  item: { catalogItemId: number | null; erpItemCodigo: string | null },
  abastecimento: Map<string, string> | null,
): Destino | null {
  if (item.catalogItemId === null) return "compras";
  if (!item.erpItemCodigo) return "emporio";
  if (!abastecimento) return null;
  return abastecimento.get(item.erpItemCodigo) === "compra_direta" ? "compras" : "emporio";
}

/**
 * Grava o destino dos itens de uma requisição: na externa, Empório ou Compras;
 * na interna, nada (sai toda do estoque local). Nunca lança.
 */
export async function definirDestinos(requisicaoId: number, organizationId?: number): Promise<void> {
  try {
    const [req] = await db.select({ tipo: requisicoes.tipo, organizationId: requisicoes.organizationId }).from(requisicoes).where(eq(requisicoes.id, requisicaoId)).limit(1);
    if (!req) return;
    const orgId = organizationId ?? req.organizationId;
    if (req.tipo !== "externa") {
      await db.update(requisicaoItens).set({ destino: null }).where(eq(requisicaoItens.requisicaoId, requisicaoId));
      return;
    }
    const itens = await db
      .select({ id: requisicaoItens.id, catalogItemId: requisicaoItens.catalogItemId, erpItemCodigo: catalogItems.erpItemCodigo })
      .from(requisicaoItens)
      .leftJoin(catalogItems, eq(catalogItems.id, requisicaoItens.catalogItemId))
      .where(eq(requisicaoItens.requisicaoId, requisicaoId));
    const catalogo = await catalogoErpEmCache(orgId);
    const abastecimento = catalogo ? new Map(catalogo.itens.map((i) => [i.codigo, i.abastecimento ?? "central"])) : null;
    for (const i of itens) {
      await db.update(requisicaoItens).set({ destino: destinoDoItem(i, abastecimento) }).where(eq(requisicaoItens.id, i.id));
    }
  } catch (erro) {
    console.error("Não foi possível decidir o destino dos itens:", erro);
  }
}

/** A situação no ERP das solicitações de compra destas requisições (id → situação), para a tela acompanhar. */
export async function situacaoComprasNoErp(requisicaoIds: number[], organizationId: number): Promise<Record<number, { numero: string; status: string; pedido: string | null }>> {
  if (requisicaoIds.length === 0) return {};
  const ligacao = await ligacaoDaEmpresa(organizationId);
  if (!ligacao) return {};
  try {
    const ids = requisicaoIds.map((id) => `checklist-${id}`).join(",");
    // tempo curto: a tela não espera o ERP
    const resposta = await chamarErp(`/api/solicitacoes-compra?ids=${encodeURIComponent(ids)}`, { signal: AbortSignal.timeout(4_000) }, ligacao);
    if (!resposta.ok) return {};
    const dados = (await resposta.json()) as { solicitacoes: { id_externo: string; numero: string; status: string; pedido: string | null }[] };
    return Object.fromEntries(dados.solicitacoes.map((s) => [Number(s.id_externo.replace("checklist-", "")), { numero: s.numero, status: s.status, pedido: s.pedido }]));
  } catch {
    return {};
  }
}

/**
 * O filtro da requisição: com setor, fica o produto que o ERP marca para o
 * setor, o que o ERP não marcou para nenhum, e o que não está ligado ao ERP.
 */
export function produtoDoSetor(erpItemCodigo: string | null, setor: string, setores: Map<string, string[]>): boolean {
  if (!erpItemCodigo) return true;
  const doItem = setores.get(erpItemCodigo);
  return !doItem || doItem.length === 0 || doItem.includes(setor);
}

const MEDIDA: Record<string, [string, number]> = { kg: ["massa", 1], g: ["massa", 0.001], L: ["volume", 1], ml: ["volume", 0.001] };

/** Quanto de "para" vem em 1 de "de" (g → kg = 0,001); null se não converte. */
export function converterMedida(de: string, para: string | null): number | null {
  if (!para || de === para) return 1;
  const a = MEDIDA[de], b = MEDIDA[para];
  return a && b && a[0] === b[0] ? a[1] / b[1] : null;
}

export type ResultadoEnvio = { status: "enviada" | "aguardando" | "pendente" | "erro"; mensagem: string | null; numero: string | null };

async function gravar(id: number, r: ResultadoEnvio) {
  await db
    .update(requisicoes)
    .set({
      erpStatus: r.status,
      erpMensagem: r.mensagem,
      erpNumero: r.numero,
      erpEnviadoEm: r.status === "enviada" ? new Date() : null,
    })
    .where(eq(requisicoes.id, id));
  return r;
}

/** Cancela no ERP (requisição cancelada ou excluída aqui). */
async function cancelarNoErp(requisicaoId: number, ligacao?: LigacaoErp | null): Promise<ResultadoEnvio> {
  let resposta: Response;
  try {
    resposta = await chamarErp("/api/requisicoes", {
      method: "POST",
      body: JSON.stringify({ id_externo: `checklist-${requisicaoId}`, situacao: "cancelada" }),
    }, ligacao);
  } catch {
    return { status: "pendente", mensagem: "O ERP não respondeu. Vai de novo na próxima tentativa.", numero: null };
  }
  const dados = (await resposta.json().catch(() => ({}))) as { numero?: string; erros?: string[]; erro?: string };
  if (resposta.ok) return { status: "enviada", mensagem: null, numero: dados.numero ?? null };
  if (resposta.status === 401 || resposta.status === 503) {
    return { status: "pendente", mensagem: dados.erro ?? "O ERP recusou a chave da ligação.", numero: null };
  }
  return { status: "erro", mensagem: (dados.erros ?? [dados.erro ?? `O ERP respondeu com erro ${resposta.status}.`]).join(" "), numero: null };
}

/** Cancela no ERP a solicitação de compra (a parte que ia por Compras). */
async function cancelarSolicitacaoNoErp(requisicaoId: number, ligacao?: LigacaoErp | null): Promise<ResultadoEnvio> {
  let resposta: Response;
  try {
    resposta = await chamarErp("/api/solicitacoes-compra", {
      method: "POST",
      body: JSON.stringify({ id_externo: `checklist-${requisicaoId}`, situacao: "cancelada" }),
    }, ligacao);
  } catch {
    return { status: "pendente", mensagem: "O ERP não respondeu. Vai de novo na próxima tentativa.", numero: null };
  }
  return lerResposta(resposta);
}

async function lerResposta(resposta: Response, aviso: string | null = null): Promise<ResultadoEnvio> {
  const dados = (await resposta.json().catch(() => ({}))) as { numero?: string; erros?: string[]; erro?: string };
  if (resposta.ok) return { status: "enviada", mensagem: aviso, numero: dados.numero ?? null };
  if (resposta.status === 401 || resposta.status === 503) {
    return { status: "pendente", mensagem: dados.erro ?? "O ERP recusou a chave da ligação.", numero: null };
  }
  return { status: "erro", mensagem: (dados.erros ?? [dados.erro ?? `O ERP respondeu com erro ${resposta.status}.`]).join(" "), numero: null };
}

/** Junta o resultado da parte do Empório com o da parte de Compras: vale o pior. */
function combinar(...partes: ResultadoEnvio[]): ResultadoEnvio {
  const ordem: ResultadoEnvio["status"][] = ["erro", "pendente", "aguardando", "enviada"];
  const status = ordem.find((s) => partes.some((p) => p.status === s)) ?? "enviada";
  return {
    status,
    mensagem: partes.map((p) => p.mensagem).filter(Boolean).join(" ") || null,
    numero: partes.map((p) => p.numero).filter(Boolean).join(" · ") || null,
  };
}

const ENVIADA: ResultadoEnvio = { status: "enviada", mensagem: null, numero: null };

/** A requisição foi excluída aqui: cancela no ERP a aberta e a solicitação de compra (não há mais onde gravar o resultado). */
export async function cancelarExcluidaNoErp(requisicaoId: number): Promise<void> {
  const [req] = await db.select({ organizationId: requisicoes.organizationId }).from(requisicoes).where(eq(requisicoes.id, requisicaoId)).limit(1);
  const ligacao = await ligacaoDaEmpresa(req?.organizationId);
  if (!ligacao) return;
  const r = combinar(await cancelarNoErp(requisicaoId, ligacao), await cancelarSolicitacaoNoErp(requisicaoId, ligacao));
  if (r.status !== "enviada") console.error(`Requisição ${requisicaoId} excluída, mas o ERP não cancelou: ${r.mensagem}`);
}

/**
 * Leva ao ERP a fase atual da requisição (aberta, conferida ou cancelada) e
 * grava o resultado nela. Nunca lança: o que der errado vira status e
 * mensagem para o gestor ver em Gerenciar › ERP. O ERP reconhece a mesma
 * requisição pelo id: mandar de novo não duplica nem baixa duas vezes.
 */
type ReqEnvio = {
  id: number; tipo: string; status: string; observacao: string; createdAt: Date; concluidoEm: Date | null;
  erpCnpj: string; setor: string | null; solicitante: string;
};
type ItemEnvio = {
  id: number; nome: string; catalogItemId: number | null; qtdPedida: string; qtdConferida: string | null;
  unidadePedida: string; unidadeProduto: string | null; erpItemCodigo: string | null; erpFator: string | null; destino: string | null;
};

export async function enviarRequisicaoAoErp(requisicaoId: number): Promise<ResultadoEnvio> {
  const [req] = await db
    .select({
      id: requisicoes.id,
      organizationId: requisicoes.organizationId,
      tipo: requisicoes.tipo,
      status: requisicoes.status,
      observacao: requisicoes.observacao,
      createdAt: requisicoes.createdAt,
      concluidoEm: requisicoes.concluidoEm,
      unitName: units.name,
      erpCnpj: units.erpCnpj,
      setor: jobFunctions.name,
      solicitante: users.name,
    })
    .from(requisicoes)
    .innerJoin(units, eq(units.id, requisicoes.unitId))
    .innerJoin(users, eq(users.id, requisicoes.requesterId))
    .leftJoin(jobFunctions, eq(jobFunctions.id, users.jobFunctionId))
    .where(eq(requisicoes.id, requisicaoId))
    .limit(1);
  if (!req) return { status: "erro", mensagem: "Requisição não encontrada.", numero: null };
  const ligacao = await ligacaoDaEmpresa(req.organizationId);
  if (!ligacao) return gravar(req.id, { status: "pendente", mensagem: "A ligação com o ERP ainda não está configurada.", numero: null });
  const externa = req.tipo === "externa";
  if (req.status === "cancelada") {
    return gravar(req.id, combinar(await cancelarNoErp(req.id, ligacao), externa ? await cancelarSolicitacaoNoErp(req.id, ligacao) : ENVIADA));
  }
  if (!req.erpCnpj) {
    return gravar(req.id, { status: "aguardando", mensagem: `A unidade ${req.unitName} ainda não está ligada a uma empresa do ERP.`, numero: null });
  }

  // destino ainda não decidido (o ERP não respondeu na hora): decide agora
  if (externa) await definirDestinos(req.id, req.organizationId);
  const itens: ItemEnvio[] = await db
    .select({
      id: requisicaoItens.id,
      nome: requisicaoItens.nome,
      catalogItemId: requisicaoItens.catalogItemId,
      qtdPedida: requisicaoItens.qtdPedida,
      qtdConferida: requisicaoItens.qtdConferida,
      unidadePedida: requisicaoItens.unidadeMedida,
      unidadeProduto: catalogItems.unitMeasure,
      erpItemCodigo: catalogItems.erpItemCodigo,
      erpFator: catalogItems.erpFator,
      destino: requisicaoItens.destino,
    })
    .from(requisicaoItens)
    .leftJoin(catalogItems, eq(catalogItems.id, requisicaoItens.catalogItemId))
    .where(eq(requisicaoItens.requisicaoId, req.id));

  const r = { ...req, erpCnpj: req.erpCnpj };
  // Interna: toda do estoque local. Externa: a parte do Empório vira requisição
  // (baixa na conferência); a de Compras, solicitação de compra.
  const doEmporio = externa ? itens.filter((i) => i.destino !== "compras") : itens;
  const deCompras = externa ? itens.filter((i) => i.destino === "compras") : [];
  const parteEmporio = doEmporio.length > 0 ? await enviarParteEstoque(r, doEmporio, ligacao) : await cancelarNoErp(req.id, ligacao);
  const parteCompras = !externa ? ENVIADA : deCompras.length > 0 ? await enviarParteCompras(r, deCompras, ligacao) : await cancelarSolicitacaoNoErp(req.id, ligacao);
  return gravar(req.id, combinar(parteEmporio, parteCompras));
}

/** O que sai do estoque (interna, ou a parte do Empório da externa): requisição no ERP. */
async function enviarParteEstoque(req: ReqEnvio, itens: ItemEnvio[], ligacao?: LigacaoErp | null): Promise<ResultadoEnvio> {
  const conferida = req.status === "conferida";
  // Item avulso (fora do catálogo) não tem como baixar estoque: vai como aviso.
  const avulsos = itens.filter((i) => i.catalogItemId === null).map((i) => i.nome);
  // O fator vale para a medida atual do produto; item pedido antes noutra
  // medida (o catálogo mudou depois, ex.: espelho do ERP) é convertido.
  const fatorDe = (i: (typeof itens)[number]) => {
    const conversao = converterMedida(i.unidadePedida, i.unidadeProduto);
    return conversao === null ? null : Number(i.erpFator) * conversao;
  };
  const semLigacao = itens.filter((i) => i.catalogItemId !== null && (!i.erpItemCodigo || !(Number(i.erpFator) > 0))).map((i) => i.nome);
  const outraMedida = itens.filter((i) => i.catalogItemId !== null && i.erpItemCodigo && Number(i.erpFator) > 0 && fatorDe(i) === null)
    .map((i) => `${i.nome} (pedido em ${i.unidadePedida}, produto agora em ${i.unidadeProduto})`);
  // Conferida baixa estoque: tem que ir inteira. Aberta vai com o que já está
  // ligado, para o ERP ver o pedido na hora; o resto fica no aviso.
  if (conferida && outraMedida.length > 0) {
    return { status: "aguardando", mensagem: `Medida que não dá para converter: ${outraMedida.join(", ")}.`, numero: null };
  }
  if (conferida && semLigacao.length > 0) {
    return {
      status: "aguardando",
      mensagem: `Produto sem item do ERP ligado: ${[...new Set(semLigacao)].join(", ")}.`,
      numero: null,
    };
  }

  // O ERP não aceita o mesmo item duas vezes: soma, já na unidade dele.
  const porCodigo = new Map<string, { solicitada: number; atendida: number }>();
  for (const i of itens) {
    if (!i.erpItemCodigo) continue;
    const fator = fatorDe(i);
    if (fator === null || !(Number(i.erpFator) > 0)) continue;
    const atual = porCodigo.get(i.erpItemCodigo) ?? { solicitada: 0, atendida: 0 };
    atual.solicitada += Number(i.qtdPedida) * fator;
    atual.atendida += Number(i.qtdConferida ?? i.qtdPedida) * fator;
    porCodigo.set(i.erpItemCodigo, atual);
  }
  const faltaLigar = conferida ? [] : [...new Set([...semLigacao, ...outraMedida])];
  const aviso = [
    avulsos.length > 0 ? `Itens avulsos não baixados no ERP: ${avulsos.join(", ")}.` : null,
    faltaLigar.length > 0 ? `Ainda sem item do ERP ligado (precisa ligar antes de conferir): ${faltaLigar.join(", ")}.` : null,
  ].filter(Boolean).join(" ") || null;
  if (porCodigo.size === 0) {
    return conferida
      ? { status: "enviada", mensagem: aviso ?? "Nenhum produto do catálogo: nada a baixar.", numero: null }
      : { status: "aguardando", mensagem: aviso ?? "Nenhum produto ligado ao ERP ainda.", numero: null };
  }

  const arredondar = (n: number) => Math.round(n * 10_000) / 10_000;
  const corpo = {
    id_externo: `checklist-${req.id}`,
    situacao: conferida ? "conferida" : "aberta",
    unidade_cnpj: req.erpCnpj,
    // o ERP decide o local: interna do Estoque local da unidade, externa do Estoque central do Empório
    tipo: req.tipo,
    setor: req.setor ?? undefined,
    data_solicitacao: checklistDayForInstant(req.createdAt),
    data_atendimento: conferida ? checklistDayForInstant(req.concluidoEm ?? new Date()) : checklistDayForInstant(req.createdAt),
    observacao: [`Requisição ${req.tipo} nº ${req.id} do app de checklist`, req.observacao].filter(Boolean).join(" · "),
    itens: [...porCodigo.entries()]
      .filter(([, q]) => q.solicitada > 0)
      .map(([codigo, q]) => ({ codigo, qtd_solicitada: arredondar(q.solicitada), ...(conferida ? { qtd_atendida: arredondar(q.atendida) } : {}) })),
  };

  let resposta: Response;
  try {
    resposta = await chamarErp("/api/requisicoes", { method: "POST", body: JSON.stringify(corpo) }, ligacao);
  } catch {
    return { status: "pendente", mensagem: "O ERP não respondeu. Vai de novo na próxima tentativa.", numero: null };
  }
  return lerResposta(resposta, aviso);
}

/**
 * A parte da externa que chega por compra direta: solicitação de compra no
 * ERP, para o comprador. Produto ligado vai pelo código, na unidade do ERP;
 * avulso, como foi escrito. Depois que o comprador pega, editar aqui não muda lá.
 */
async function enviarParteCompras(req: ReqEnvio, itens: ItemEnvio[], ligacao?: LigacaoErp | null): Promise<ResultadoEnvio> {
  const arredondar = (n: number) => Math.round(n * 10_000) / 10_000;
  const linhas = itens.map((i) => {
    const conversao = converterMedida(i.unidadePedida, i.unidadeProduto);
    const fator = i.erpItemCodigo && Number(i.erpFator) > 0 && conversao !== null ? Number(i.erpFator) * conversao : null;
    return fator !== null
      ? { codigo: i.erpItemCodigo, descricao: i.nome, quantidade: arredondar(Number(i.qtdPedida) * fator) }
      : { descricao: i.nome, quantidade: Number(i.qtdPedida), unidade: i.unidadePedida };
  }).filter((l) => l.quantidade > 0);
  if (linhas.length === 0) return cancelarSolicitacaoNoErp(req.id, ligacao);
  const corpo = {
    id_externo: `checklist-${req.id}`,
    situacao: "aberta",
    unidade_cnpj: req.erpCnpj,
    data: checklistDayForInstant(req.createdAt),
    setor: req.setor ?? undefined,
    solicitante: req.solicitante,
    observacao: [`Requisição externa nº ${req.id} do app de checklist`, req.observacao].filter(Boolean).join(" · "),
    itens: linhas,
  };
  let resposta: Response;
  try {
    resposta = await chamarErp("/api/solicitacoes-compra", { method: "POST", body: JSON.stringify(corpo) }, ligacao);
  } catch {
    return { status: "pendente", mensagem: "O ERP não respondeu. Vai de novo na próxima tentativa.", numero: null };
  }
  return lerResposta(resposta);
}


/**
 * Tenta de novo o que ficou para trás, em qualquer fase: pendente (ERP fora
 * do ar) e aguardando (faltava ligação, que pode já ter sido feita). Erro de
 * dado não volta sozinho — o gestor corrige e manda reenviar.
 */
export async function enviarPendentesAoErp(organizationId: number, limite = 20): Promise<number> {
  if (!(await ligacaoDaEmpresa(organizationId))) return 0;
  const fila = await db
    .select({ id: requisicoes.id })
    .from(requisicoes)
    .where(
      and(
        eq(requisicoes.organizationId, organizationId),
        inArray(requisicoes.erpStatus, ["pendente", "aguardando"]),
      ),
    )
    .orderBy(requisicoes.createdAt)
    .limit(limite);
  let enviadas = 0;
  for (const r of fila) {
    if ((await enviarRequisicaoAoErp(r.id)).status === "enviada") enviadas++;
  }
  return enviadas;
}

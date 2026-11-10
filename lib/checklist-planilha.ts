import "server-only";
import ExcelJS from "exceljs";

export const COLUNAS = ["Modelo", "Tipo", "Função", "Horário limite", "Descrição", "Item", "Exige foto"] as const;

export type ModeloLido = {
  nome: string;
  tipo: "daily" | "weekly";
  funcaoNome: string | null;
  horario: string | null;
  descricao: string;
  itens: { label: string; requiresPhoto: boolean }[];
};
export type ErroLinha = { linha: number; msg: string };
export type Leitura = { modelos: ModeloLido[]; erros: ErroLinha[] };

const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
export const chaveNome = (s: string) => sem(s).replace(/\s+/g, " ");

function texto(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((r) => r.text).join("").trim();
    if ("text" in v && typeof v.text === "string") return v.text.trim();
    if ("result" in v && v.result !== undefined) return texto(v.result as ExcelJS.CellValue);
    return "";
  }
  return String(v).trim();
}

function horario(v: ExcelJS.CellValue): string | null | "invalido" {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return `${String(v.getUTCHours()).padStart(2, "0")}:${String(v.getUTCMinutes()).padStart(2, "0")}`;
  if (typeof v === "number" && v >= 0 && v < 1) {
    const min = Math.round(v * 1440);
    return `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
  }
  const m = /^(\d{1,2})(?::|h)(\d{2})/.exec(texto(v));
  if (!m) return "invalido";
  const h = Number(m[1]);
  const mi = Number(m[2]);
  return h > 23 || mi > 59 ? "invalido" : `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
}

const sim = (s: string) => ["sim", "s", "x", "1", "true", "yes"].includes(sem(s));
const nao = (s: string) => ["", "nao", "n", "0", "false", "no"].includes(sem(s));

/** Lê a primeira aba: uma linha por item; linhas com o mesmo Modelo viram o mesmo checklist. */
export async function lerPlanilha(buffer: Buffer): Promise<Leitura> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    return { modelos: [], erros: [{ linha: 0, msg: "Não consegui abrir o arquivo. Envie uma planilha .xlsx (baixe o modelo)." }] };
  }
  const ws = wb.worksheets[0];
  if (!ws) return { modelos: [], erros: [{ linha: 0, msg: "A planilha está vazia." }] };

  // cabeçalho: acha as colunas pelo nome, sem ligar para acento ou maiúscula
  const cab = new Map<string, number>();
  ws.getRow(1).eachCell((cell, col) => cab.set(sem(texto(cell.value)), col));
  const col = (nome: string) => cab.get(sem(nome));
  const faltando = (["Modelo", "Item"] as const).filter((n) => !col(n));
  if (faltando.length) return { modelos: [], erros: [{ linha: 1, msg: `Falta a coluna ${faltando.join(" e ")} na primeira linha. Baixe a planilha modelo.` }] };

  const erros: ErroLinha[] = [];
  const porModelo = new Map<string, ModeloLido & { primeiraLinha: number }>();
  if (ws.rowCount > 3000) return { modelos: [], erros: [{ linha: 0, msg: "A planilha tem linhas demais (máximo 3000)." }] };

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const get = (n: string) => (col(n) ? row.getCell(col(n)!).value : null);
    const nome = texto(get("Modelo")).slice(0, 255);
    const item = texto(get("Item")).slice(0, 2000);
    if (!nome && !item) continue; // linha em branco
    if (!nome) { erros.push({ linha: r, msg: "Falta o nome do modelo." }); continue; }
    if (!item) { erros.push({ linha: r, msg: `Falta o item do modelo "${nome}".` }); continue; }

    const tipoTxt = sem(texto(get("Tipo")));
    let tipo: "daily" | "weekly" | null = null;
    if (["", "diario", "daily", "dia"].includes(tipoTxt)) tipo = "daily";
    else if (["semanal", "weekly", "semana"].includes(tipoTxt)) tipo = "weekly";
    if (!tipo) { erros.push({ linha: r, msg: `Tipo "${texto(get("Tipo"))}" não existe. Use Diário ou Semanal.` }); continue; }
    const tipoInformado = tipoTxt !== "";

    const h = horario(get("Horário limite"));
    if (h === "invalido") { erros.push({ linha: r, msg: `Horário limite "${texto(get("Horário limite"))}" inválido. Use o formato 10:00.` }); continue; }

    const fotoTxt = texto(get("Exige foto"));
    if (!sim(fotoTxt) && !nao(fotoTxt)) { erros.push({ linha: r, msg: `"Exige foto" deve ser Sim ou Não (veio "${fotoTxt}").` }); continue; }

    const funcao = texto(get("Função")) || null;
    const descricao = texto(get("Descrição"));
    const chave = chaveNome(nome);
    const atual = porModelo.get(chave);
    if (!atual) {
      porModelo.set(chave, { nome, tipo, funcaoNome: funcao, horario: h, descricao, itens: [{ label: item, requiresPhoto: sim(fotoTxt) }], primeiraLinha: r });
      continue;
    }
    // linhas do mesmo modelo: os dados do cabeçalho do modelo não podem divergir
    if (tipoInformado && atual.tipo !== tipo) { erros.push({ linha: r, msg: `"${nome}": o Tipo é diferente do das linhas anteriores.` }); continue; }
    if (funcao && atual.funcaoNome && chaveNome(atual.funcaoNome) !== chaveNome(funcao)) { erros.push({ linha: r, msg: `"${nome}": a Função é diferente da das linhas anteriores.` }); continue; }
    if (h && atual.horario && atual.horario !== h) { erros.push({ linha: r, msg: `"${nome}": o Horário limite é diferente do das linhas anteriores.` }); continue; }
    atual.funcaoNome ??= funcao;
    atual.horario ??= h;
    if (!atual.descricao) atual.descricao = descricao;
    atual.itens.push({ label: item, requiresPhoto: sim(fotoTxt) });
  }
  if (porModelo.size === 0 && erros.length === 0) erros.push({ linha: 0, msg: "Nenhum item encontrado. Preencha as linhas abaixo do cabeçalho." });
  if (porModelo.size > 100) erros.push({ linha: 0, msg: "Mais de 100 modelos de uma vez. Divida em planilhas menores." });
  return { modelos: [...porModelo.values()].map((m) => ({ nome: m.nome, tipo: m.tipo, funcaoNome: m.funcaoNome, horario: m.horario, descricao: m.descricao, itens: m.itens })), erros };
}

type ModeloExport = { nome: string; tipo: string; funcao: string | null; horario: string | null; descricao: string; itens: { label: string; requiresPhoto: boolean }[] };

export async function montarPlanilha(modelos: ModeloExport[], funcoes: string[], exemplo: boolean): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Modelos");
  ws.addRow([...COLUNAS]);
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0D1B2A" } };
  [32, 12, 22, 16, 30, 54, 12].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  ws.views = [{ state: "frozen", ySplit: 1 }];
  const linhas = exemplo
    ? [
        ["Abertura da cozinha", "Diário", funcoes[0] ?? "", "10:00", "Rotina de abertura", "Ligar os equipamentos", "Não"],
        ["Abertura da cozinha", "Diário", funcoes[0] ?? "", "10:00", "Rotina de abertura", "Conferir a temperatura da câmara fria", "Sim"],
        ["Limpeza geral", "Semanal", "", "", "", "Higienizar a coifa", "Sim"],
      ]
    : modelos.flatMap((m) => m.itens.map((i) => [m.nome, m.tipo === "weekly" ? "Semanal" : "Diário", m.funcao ?? "", m.horario ?? "", m.descricao, i.label, i.requiresPhoto ? "Sim" : "Não"]));
  for (const l of linhas) ws.addRow(l);
  const ajuda = wb.addWorksheet("Como preencher");
  ajuda.getColumn(1).width = 110;
  [
    "Uma linha por item. Linhas com o mesmo nome em Modelo viram o mesmo checklist, com os itens na ordem em que aparecem.",
    "Tipo: Diário ou Semanal (em branco vale Diário).",
    "Função: o nome exato de uma função cadastrada, ou deixe em branco para valer para todas.",
    "Horário limite: no formato 10:00 (opcional).",
    "Exige foto: Sim ou Não (em branco vale Não).",
    "Modelos com o mesmo nome de um que já existe são pulados, nunca sobrescritos.",
    "",
    `Funções cadastradas: ${funcoes.length ? funcoes.join(", ") : "nenhuma"}`,
  ].forEach((t) => ajuda.addRow([t]));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

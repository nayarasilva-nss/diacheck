"use server";

import { revalidatePath } from "next/cache";
import { canFecharCaixa } from "@/lib/auth/caixa";
import { getCurrentUser } from "@/lib/auth/dal";
import { unidadeDaContagem } from "@/lib/data/contagem";
import { caixaNoErp, enviarCaixaAoErp } from "@/lib/erp/caixa";
import { isGestorProfile } from "@/lib/auth/profile";
import { ligacaoDaEmpresa } from "@/lib/erp/integracao";

export type ResultadoCaixa = { error?: string; ok?: string };
export type FechamentoForm = {
  data: string; caixa: string; fundo_abertura: string; suprimento: string; sangria: string; troco_final: string; observacao: string;
  valores: { terminal: string; grupo: string; valor: string }[];
  vouchers: { codigo: string; valor: string }[];
  saidas: { finalidade: string; valor: string }[];
  vouchersVendidos: { codigo: string; valor: string; forma: string; cliente: string; validade: string }[];
};

const dinheiro = (t: string) => t.trim() === "" || /^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+([.,]\d{1,2})?$/.test(t.trim());

/** Manda ao ERP o fechamento do caixa. Mandar de novo o mesmo caixa no mesmo dia corrige o que foi enviado. */
export async function enviarFechamentoCaixa(unidadeId: number, f: FechamentoForm): Promise<ResultadoCaixa> {
  const user = await getCurrentUser();
  if (!canFecharCaixa(user)) return { error: "Você não fecha o caixa pelo app." };
  const { unidade } = await unidadeDaContagem(user, unidadeId);
  if (!unidade || unidade.id !== unidadeId) return { error: "Unidade sem ligação com o ERP." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.data)) return { error: "Data inválida." };
  if (f.troco_final.trim() === "") return { error: "Informe o troco final (o dinheiro que fica na gaveta)." };
  const invalido = [["Troco final", f.troco_final], ["Sangria", f.sangria], ["Suprimento", f.suprimento], ["Troco ao abrir", f.fundo_abertura],
    ...f.valores.map((v) => [v.terminal ? `${v.grupo} (maquininha ${v.terminal})` : v.grupo, v.valor]),
    ...f.vouchers.map((v) => [`voucher ${v.codigo}`, v.valor]), ...f.saidas.map((s) => [`saída ${s.finalidade}`, s.valor])]
    .find(([, v]) => !dinheiro(v ?? ""));
  if (invalido) return { error: `Valor inválido em ${invalido[0]}. Use números, como 1.250,40.` };
  if (f.vouchers.some((v) => v.valor.trim() !== "" && v.codigo.trim() === "")) return { error: "Informe o código de cada voucher." };
  if (f.saidas.some((s) => s.valor.trim() !== "" && s.finalidade.trim() === "")) return { error: "Informe a finalidade de cada saída." };
  const vendidos = f.vouchersVendidos.filter((v) => v.codigo.trim() !== "" || v.valor.trim() !== "");
  const vendaInvalida = vendidos.find((v) => v.codigo.trim() === "" || v.valor.trim() === "" || !dinheiro(v.valor) || !["Dinheiro", "Cartão", "Pix"].includes(v.forma));
  if (vendaInvalida) return { error: "Em cada aquisição de voucher, informe o código, o valor e como o cliente pagou." };
  const caixa = f.caixa.trim().slice(0, 40) || `Caixa ${user.name.split(" ")[0]}`;
  const ligacao = await ligacaoDaEmpresa(user.organizationId);
  // O ERP identifica o caixa por unidade + dia + nome. Dois caixas com o mesmo nome no mesmo dia viram um só, e o
  // segundo apagaria o primeiro: por isso não deixa mandar por cima do caixa de outra pessoa.
  try {
    const dia = await caixaNoErp(unidade.cnpj, f.data, ligacao);
    const dono = dia.fechamentos.find((x) => x.caixa.trim().toLowerCase() === caixa.toLowerCase());
    if (dono && dono.quem_fechou && dono.quem_fechou !== user.name && !isGestorProfile(user.profile))
      return { error: `Já existe um caixa "${dono.caixa}" enviado por ${dono.quem_fechou} neste dia. Dê outro nome ao seu caixa (por exemplo, "Caixa ${user.name.split(" ")[0]}") para não apagar o dele.` };
  } catch { /* sem resposta do ERP agora: o envio abaixo diz o erro */ }
  try {
    await enviarCaixaAoErp({
      id_externo: `${unidade.cnpj}:${f.data}:${caixa.toLowerCase()}`,
      unidade_cnpj: unidade.cnpj, data: f.data, caixa, quem: user.name,
      fundo_abertura: f.fundo_abertura.trim() || null, troco_final: f.troco_final.trim(),
      sangria: f.sangria.trim() || "0", suprimento: f.suprimento.trim() || "0",
      valores: f.valores.filter((v) => v.valor.trim() !== "").map((v) => ({ terminal: v.terminal.trim(), grupo: v.grupo, valor: v.valor.trim() })),
      vouchers: f.vouchers.filter((v) => v.valor.trim() !== "" || v.codigo.trim() !== "").map((v) => ({ codigo: v.codigo.trim(), valor: v.valor.trim() })),
      saidas: f.saidas.filter((s) => s.valor.trim() !== "" || s.finalidade.trim() !== "").map((s) => ({ finalidade: s.finalidade.trim(), valor: s.valor.trim() })),
      vouchers_vendidos: vendidos.map((v) => ({ codigo: v.codigo.trim().toUpperCase(), valor: v.valor.trim(), forma: v.forma, cliente: v.cliente.trim(), validade: v.validade.trim() })),
      observacao: f.observacao.trim().slice(0, 1000),
    }, ligacao);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível enviar o fechamento." };
  }
  revalidatePath("/caixa");
  return { ok: "Caixa fechado e enviado ao ERP. A sangria já entrou no cofre." };
}

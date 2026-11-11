import Link from "next/link";
import { redirect } from "next/navigation";
import { canFecharCaixa } from "@/lib/auth/caixa";
import { isGestorProfile } from "@/lib/auth/profile";
import { getCurrentUser } from "@/lib/auth/dal";
import { unidadeDaContagem } from "@/lib/data/contagem";
import { checklistDayForInstant } from "@/lib/date-utils";
import { caixaNoErp, type CaixaDoDia } from "@/lib/erp/caixa";
import { ligacaoDaEmpresa } from "@/lib/erp/integracao";
import { CaixaForm } from "./CaixaForm";

/**
 * Fechamento de caixa, no formato da planilha das lojas: cada maquininha por bandeira, voucher, dinheiro, saídas,
 * sangria e troco final. Vai direto para o ERP — a sangria entra no cofre na hora, e o financeiro confere no dia seguinte.
 */
export default async function CaixaPage({ searchParams }: { searchParams: Promise<{ unidade?: string; data?: string }> }) {
  const user = await getCurrentUser();
  if (!canFecharCaixa(user)) redirect("/hoje");
  const { unidade: escolhida, data: dataPedida } = await searchParams;
  const { lista, unidade } = await unidadeDaContagem(user, Number(escolhida) || null);
  const hoje = checklistDayForInstant(new Date());
  const data = dataPedida && /^\d{4}-\d{2}-\d{2}$/.test(dataPedida) && dataPedida <= hoje ? dataPedida : hoje;

  let dia: CaixaDoDia | null = null, erro: string | null = null;
  const ligacao = await ligacaoDaEmpresa(user.organizationId);
  if (!ligacao) erro = "A ligação com o ERP não está configurada para esta empresa (Gerenciar › ERP).";
  else if (unidade) {
    try {
      dia = await caixaNoErp(unidade.cnpj, data, ligacao);
    } catch (e) {
      erro = e instanceof Error ? e.message : "Não foi possível falar com o ERP.";
    }
  }
  const link = (u: number | undefined, d: string) => `/caixa?${u ? `unidade=${u}&` : ""}data=${d}`;
  // o ERP diz desde quando se fecha o caixa pelo app; antes disso, continua na planilha
  const desde = dia?.desde ?? null;
  const liberado = desde !== null && hoje >= desde;
  const formatar = (d: string) => d.split("-").reverse().join("/");

  return (
    <>
      <div className="page-topbar"><h2 style={{ marginBottom: 0 }}>Fechamento de caixa</h2></div>
      {lista.length > 1 && (
        <div className="filter-pills">
          {lista.map((u) => <Link key={u.id} href={link(u.id, data)} className={`pill${u.id === unidade?.id ? " active" : ""}`}>{u.name}</Link>)}
        </div>
      )}
      {!unidade ? (
        <div className="empty-state">Sua unidade ainda não está ligada ao ERP. Quem administra liga em Gerenciar › ERP.</div>
      ) : erro || !dia ? (
        <div className="empty-state">{erro}</div>
      ) : !liberado && isGestorProfile(user.profile) ? (
        <>
          <div className="tone-card info" style={{ marginBottom: 16 }}>
            <div className="tone-label">Prévia para o Gestor</div>
            <div className="tone-meta">
              {desde ? `O fechamento pelo app começa em ${formatar(desde)}.` : "O fechamento pelo app ainda não foi liberado."} Aqui você vê e preenche o formulário como ele vai ficar, mas nada é enviado ao ERP nem entra no cofre.
            </div>
          </div>
          <CaixaForm key={`previa-${unidade.id}-${data}`} unidadeId={unidade.id} data={data} hoje={hoje} desde={desde ?? hoje} dia={dia} quem={user.name} previa />
        </>
      ) : !liberado ? (
        <div className="empty-state">
          {desde ? `O fechamento de caixa pelo app começa em ${formatar(desde)}. Até lá, continue na planilha.` : "O fechamento de caixa pelo app ainda não foi liberado. Continue na planilha."}
        </div>
      ) : data < desde ? (
        <div className="empty-state">
          O fechamento pelo app começa em {formatar(desde)}: os dias antes disso ficam na planilha.{" "}
          <Link href={link(unidade.id, hoje)}>Ir para hoje</Link>
        </div>
      ) : (
        <CaixaForm key={`${unidade.id}-${data}`} unidadeId={unidade.id} data={data} hoje={hoje} desde={desde} dia={dia} quem={user.name} />
      )}
    </>
  );
}

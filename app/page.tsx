import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { decrypt, getSessionCookie } from "@/lib/auth/session";
import "./landing.css";

const RECURSOS: { titulo: string; texto: string; erp?: boolean }[] = [
  { titulo: "Checklists do dia", texto: "Abertura, fechamento e rotinas por unidade e função, com prazo. Quem não fez aparece como atrasado." },
  { titulo: "Diário de bordo", texto: "O registro do turno em poucos toques, para o próximo gerente saber o que aconteceu." },
  { titulo: "Anomalias com foto", texto: "Problema na operação? Registre com foto e setor, e o gestor acompanha até resolver." },
  { titulo: "Requisições", texto: "Pedidos internos e externos, conferência e confirmação do que chegou, tudo em PDF para imprimir ou enviar.", erp: true },
  { titulo: "Estoque e contagem", texto: "Saldo, custo e alertas da unidade, e a contagem de estoque feita direto no celular.", erp: true },
  { titulo: "Fechamento de caixa", texto: "Recebimentos, vouchers, sangria e troco final registrados no app, sem planilha.", erp: true },
  { titulo: "Auditorias de unidade", texto: "Roteiro de critérios com nota por grupo e relatório em PDF com a logo da sua empresa." },
  { titulo: "Várias unidades, a sua marca", texto: "Cada empresa com suas unidades, equipe, logo e cor. Cada pessoa vê só o que é da sua função." },
];

export default async function Home() {
  const session = await decrypt(await getSessionCookie());
  if (session) redirect("/hoje");

  return (
    <div className="lp">
      <nav className="lp-nav">
        <div className="lp-nav-in">
          <Image src="/diacheck-logo.png" alt="DiaCheck" width={150} height={34} priority />
          <Link className="lp-btn lp-btn-main" href="/login">Entrar</Link>
        </div>
      </nav>

      <header className="lp-hero">
        <div className="lp-wrap">
          <Image src="/diacheck-icon.png" alt="" width={104} height={104} priority />
          <h1>Tudo em ordem, do começo ao <span>fim do dia.</span></h1>
          <p>O DiaCheck organiza a rotina da sua operação: checklists, registros do turno, ocorrências e pedidos, direto no celular da equipe.</p>
          <div className="lp-row">
            <Link className="lp-btn lp-btn-main" href="/login">Entrar</Link>
            <a className="lp-btn lp-btn-ghost" href="#recursos">Ver funcionalidades</a>
          </div>
        </div>
      </header>

      <section className="lp-sec" id="recursos">
        <div className="lp-wrap">
          <h2 className="lp-title">Feito para quem vive de rotina</h2>
          <p className="lp-sub">Do checklist de abertura ao fechamento de caixa, em um só lugar.</p>
          <div className="lp-grid">
            {RECURSOS.map((r) => (
              <div className="lp-card" key={r.titulo}>
                <h3>{r.titulo}</h3>
                <p>{r.texto}</p>
                {r.erp && <span className="lp-tag">Com ERP ligado</span>}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-sec lp-how">
        <div className="lp-wrap">
          <h2 className="lp-title">Como funciona</h2>
          <p className="lp-sub">Três passos para a sua equipe começar.</p>
          <div className="lp-steps">
            <div className="lp-step"><b>1</b><h3>Cadastre a empresa</h3><p>Unidades, equipe e os checklists de cada função.</p></div>
            <div className="lp-step"><b>2</b><h3>A equipe preenche no celular</h3><p>É só instalar na tela inicial. Cada pessoa vê o que precisa fazer hoje.</p></div>
            <div className="lp-step"><b>3</b><h3>O gestor acompanha</h3><p>Atrasos, anomalias, requisições e relatórios em PDF, em tempo real.</p></div>
          </div>
        </div>
      </section>

      <section className="lp-cta">
        <div className="lp-wrap">
          <h2>Chega de perder o fio da meada</h2>
          <p>Em breve na App Store e no Google Play.</p>
          <Link className="lp-btn lp-btn-main" href="/login">Entrar no DiaCheck</Link>
        </div>
      </section>

      <footer className="lp-foot">
        <div className="lp-wrap">
          <Image src="/diacheck-logo.png" alt="DiaCheck" width={130} height={30} />
          <p>Tudo em ordem, do começo ao fim do dia.</p>
          <p>© 2026 DiaCheck</p>
        </div>
      </footer>
    </div>
  );
}

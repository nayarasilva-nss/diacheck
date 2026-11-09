import { getCurrentUser } from "@/lib/auth/dal";
import { getMinhasRotinas } from "@/lib/data/rotinas";
import { excluirRotina } from "@/lib/actions/rotinas";
import { ItemRotina } from "./ItemRotina";
import { RotinaForm } from "./RotinaForm";

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export default async function RotinasPage() {
  const user = await getCurrentUser();
  const rotinas = await getMinhasRotinas(user.id);
  const deHoje = rotinas.filter((r) => r.aplicaHoje);
  const outras = rotinas.filter((r) => !r.aplicaHoje);

  return (
    <div className="page-container">
      <h1 className="page-title">Minhas rotinas</h1>
      <p className="page-subtitle">Listas só suas, para o seu dia. Ninguém mais vê.</p>

      {deHoje.length === 0 && <p className="rotina-vazio">Nenhuma rotina para hoje. Crie a primeira abaixo.</p>}
      {deHoje.map((r) => {
        const feitos = r.itens.filter((i) => i.feito).length;
        return (
          <section className="rotina-card" key={r.id}>
            <header>
              <h2>{r.nome}</h2>
              <span className={feitos === r.itens.length ? "rotina-chip ok" : "rotina-chip"}>{feitos}/{r.itens.length}</span>
            </header>
            {r.itens.map((i) => <ItemRotina key={i.id} {...i} />)}
          </section>
        );
      })}

      {outras.length > 0 && (
        <>
          <h2 className="rotina-sec">Outros dias</h2>
          {outras.map((r) => (
            <section className="rotina-card esmaecida" key={r.id}>
              <header>
                <h2>{r.nome}</h2>
                <span className="rotina-chip">{r.dias.map((d) => DIAS[d]).join(", ")}</span>
              </header>
            </section>
          ))}
        </>
      )}

      <h2 className="rotina-sec">Gerenciar</h2>
      {rotinas.map((r) => (
        <details className="rotina-card" key={`g${r.id}`}>
          <summary>{r.nome}{r.lembreteHora ? ` · lembrete ${r.lembreteHora}` : ""}</summary>
          <RotinaForm rotina={{ id: r.id, nome: r.nome, dias: r.dias, lembreteHora: r.lembreteHora, itens: r.itens.map((i) => i.texto) }} />
          <form action={excluirRotina}>
            <input type="hidden" name="id" value={r.id} />
            <button className="btn btn-secondary" type="submit">Excluir rotina</button>
          </form>
        </details>
      ))}
      <details className="rotina-card" open={rotinas.length === 0}>
        <summary>Nova rotina</summary>
        <RotinaForm />
      </details>
    </div>
  );
}

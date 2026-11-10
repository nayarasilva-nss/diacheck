import { requireGestor } from "@/lib/auth/dal";
import { checklistDayISO, daysBeforeISO } from "@/lib/date-utils";

export default async function ExportarPage() {
  await requireGestor();
  const hoje = checklistDayISO();
  const mesPassado = daysBeforeISO(hoje, 29);

  return (
    <div className="page-container">
      <h1 className="page-title">Exportar registros</h1>
      <p className="page-subtitle">Baixe os registros da sua empresa em planilha (CSV, abre no Excel e no Google Planilhas).</p>

      <form className="rotina-card rotina-form" action="/api/exportar" method="get">
        <div className="form-group">
          <label htmlFor="tipo">O que exportar</label>
          <select id="tipo" name="tipo" defaultValue="checklists">
            <option value="checklists">Checklists preenchidos (item a item)</option>
            <option value="anomalias">Anomalias</option>
            <option value="requisicoes">Requisições (item a item)</option>
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="de">De</label>
          <input id="de" type="date" name="de" defaultValue={mesPassado} required />
        </div>
        <div className="form-group">
          <label htmlFor="ate">Até</label>
          <input id="ate" type="date" name="ate" defaultValue={hoje} required />
        </div>
        <p className="rotina-vazio" style={{ margin: 0 }}>Período de até 1 ano. O arquivo traz só os dados da sua empresa.</p>
        <button className="btn btn-primary" type="submit">Baixar planilha</button>
      </form>
    </div>
  );
}

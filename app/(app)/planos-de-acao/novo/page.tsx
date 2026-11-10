import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { anomalies, units } from "@/lib/db/schema";
import { requireGestor } from "@/lib/auth/dal";
import { getResponsaveis } from "@/lib/data/planos";
import { daysAgoISO } from "@/lib/date-utils";
import { NovoPlanoForm } from "../Forms";

export default async function NovoPlanoPage({ searchParams }: { searchParams: Promise<{ anomalia?: string | string[] }> }) {
  const gestor = await requireGestor();
  const orgId = gestor.organizationId!;
  const sp = await searchParams;
  const ids = (Array.isArray(sp.anomalia) ? sp.anomalia : sp.anomalia ? sp.anomalia.split(",") : []).map(Number).filter(Boolean);

  const [pessoas, recentes] = await Promise.all([
    getResponsaveis(orgId),
    db
      .select({ id: anomalies.id, date: anomalies.date, tipos: anomalies.tipos, setores: anomalies.setores, unitName: units.name, oQueAconteceu: anomalies.oQueAconteceu, causaPercebida: anomalies.causaPercebida })
      .from(anomalies)
      .innerJoin(units, eq(units.id, anomalies.unitId))
      .where(eq(anomalies.organizationId, orgId))
      .orderBy(desc(anomalies.date), desc(anomalies.id))
      .limit(60),
  ]);
  const base = recentes.filter((a) => ids.includes(a.id));
  const inicial = {
    titulo: base[0] ? `${base[0].tipos[0] ?? "Anomalia"} em ${base[0].setores[0] ?? base[0].unitName}` : "",
    problema: base.map((a) => a.oQueAconteceu).join("\n\n"),
    causaRaiz: base.map((a) => a.causaPercebida).filter(Boolean).join("\n\n"),
  };

  return (
    <div className="page-container">
      <h1 className="page-title">Novo plano de ação</h1>
      <p className="page-subtitle">Defina o problema, a causa e quem faz o quê. Os responsáveis recebem aviso no celular.</p>
      <NovoPlanoForm pessoas={pessoas} anomalias={recentes} selecionadas={ids} inicial={inicial} hojeMais30={daysAgoISO(-30)} />
    </div>
  );
}

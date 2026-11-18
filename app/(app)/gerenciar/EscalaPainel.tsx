import { and, asc, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { escalaExcecoes, organizations, units, users } from "@/lib/db/schema";
import { checklistDayISO } from "@/lib/date-utils";
import { EscalaBoard } from "./EscalaBoard";

/** Gerenciar › Escala: início da escala e exceções pontuais (trocas, rodízio, coberturas). */
export async function EscalaPainel({ organizationId }: { organizationId: number }) {
  const hoje = checklistDayISO();
  const [[org], pessoas, excecoes] = await Promise.all([
    db.select({ desde: organizations.escalaVigenteDesde }).from(organizations).where(eq(organizations.id, organizationId)).limit(1),
    db
      .select({ id: users.id, name: users.name, profile: users.profile, unitName: units.name, folgaDias: users.folgaDias })
      .from(users)
      .leftJoin(units, eq(units.id, users.unitId))
      .where(eq(users.organizationId, organizationId))
      .orderBy(asc(users.name)),
    db
      .select({ id: escalaExcecoes.id, date: escalaExcecoes.date, tipo: escalaExcecoes.tipo, name: users.name, unitName: units.name })
      .from(escalaExcecoes)
      .innerJoin(users, eq(users.id, escalaExcecoes.userId))
      .leftJoin(units, eq(units.id, users.unitId))
      .where(and(eq(escalaExcecoes.organizationId, organizationId), gte(escalaExcecoes.date, hoje)))
      .orderBy(asc(escalaExcecoes.date), asc(users.name)),
  ]);
  const escalaveis = pessoas.filter((p) => p.profile === "gerente" || p.profile === "lider");

  return (
    <EscalaBoard
      hoje={hoje}
      desde={org?.desde ?? null}
      pessoas={escalaveis.map((p) => ({ id: p.id, name: p.name, unitName: p.unitName, folgaDias: p.folgaDias }))}
      excecoes={excecoes}
    />
  );
}

/**
 * Lista as requisições sem nenhum item (só leitura, não altera nada).
 * Elas nasciam quando o insert dos itens falhava depois do cabeçalho já
 * gravado (ver gravarItens em lib/actions/requisicoes.ts). Para limpar,
 * o Gestor exclui pela tela de Requisições, que também cancela no ERP.
 *
 *   npm run db:requisicoes-vazias
 *   npm run db:requisicoes-vazias -- ivan.junio   (só de uma pessoa)
 */
import { and, desc, eq, notExists, sql } from "drizzle-orm";
import { db } from "../lib/db";
import { requisicoes, requisicaoItens, units, users } from "../lib/db/schema";

async function main() {
  const username = process.argv[2];
  const rows = await db
    .select({
      id: requisicoes.id,
      tipo: requisicoes.tipo,
      status: requisicoes.status,
      erpStatus: requisicoes.erpStatus,
      createdAt: requisicoes.createdAt,
      unidade: units.name,
      solicitante: users.name,
      username: users.username,
    })
    .from(requisicoes)
    .innerJoin(units, eq(units.id, requisicoes.unitId))
    .innerJoin(users, eq(users.id, requisicoes.requesterId))
    .where(
      and(
        notExists(db.select({ x: sql`1` }).from(requisicaoItens).where(eq(requisicaoItens.requisicaoId, requisicoes.id))),
        username ? eq(users.username, username) : undefined,
      ),
    )
    .orderBy(desc(requisicoes.createdAt));

  if (rows.length === 0) {
    console.log("Nenhuma requisição vazia.");
  } else {
    console.table(
      rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
      })),
    );
    console.log(`${rows.length} requisição(ões) sem itens.`);
  }
  process.exit(0);
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});

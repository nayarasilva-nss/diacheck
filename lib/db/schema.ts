import {
  pgTable,
  serial,
  text,
  varchar,
  integer,
  date,
  timestamp,
  pgEnum,
  boolean,
  numeric,
  jsonb,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const profileEnum = pgEnum("profile", ["gestor", "gerente", "lider", "rh", "master"]);
export const checklistTypeEnum = pgEnum("checklist_type_kind", ["daily", "weekly"]);
export const completionStatusEnum = pgEnum("completion_status", [
  "conforme",
  "nao-conforme",
  "nao-se-aplica",
  "pending",
]);
export const historyStatusEnum = pgEnum("history_status", ["completed", "pending"]);
export const documentCategoryEnum = pgEnum("document_category", [
  "ficha_tecnica",
  "pop",
]);
export const shiftStatusEnum = pgEnum("shift_status", [
  "estavel",
  "sob_pressao",
  "instavel",
]);
export const leaderSelfAssessmentEnum = pgEnum("leader_self_assessment", [
  "proativo",
  "reativo",
  "apagando_incendio",
]);
export const anomalyStatusEnum = pgEnum("anomaly_status", ["aberta", "tratada"]);
export const requisicaoTipoEnum = pgEnum("requisicao_tipo", ["interna", "externa"]);
export const requisicaoStatusEnum = pgEnum("requisicao_status", [
  "aberta",
  "conferida",
  "cancelada",
]);
// Ligação com o ERP Kenkyo: a requisição conferida aqui vira baixa de
// estoque lá (POST /api/requisicoes do ERP). "nao_enviada" é o que nunca
// entrou na fila (as conferidas antes da ligação existir); "aguardando" é
// a que tem produto do catálogo ainda sem item do ERP ligado.
export const erpEnvioStatusEnum = pgEnum("erp_envio_status", [
  "nao_enviada",
  "pendente",
  "aguardando",
  "enviada",
  "erro",
]);
export const catalogUnitMeasureEnum = pgEnum("catalog_unit_measure", [
  "kg",
  "g",
  "un",
  "L",
  "ml",
  "cx",
  "pct",
]);
// A aprovação é por item (ver solicitacaoItemStatusEnum), não aqui — um
// pedido pode ter alguns itens aprovados e outros reprovados. Esse
// status só marca se o pedido inteiro ainda está ativo ou foi retirado
// por quem pediu; o "resumo" (aguardando aprovação, aprovação parcial,
// comprada, etc.) é calculado a partir dos itens — ver
// resumoSolicitacao em lib/data/solicitacoes.ts.
export const solicitacaoStatusEnum = pgEnum("solicitacao_status", [
  "aberta",
  "cancelada",
]);

export const solicitacaoItemStatusEnum = pgEnum("solicitacao_item_status", [
  "pendente",
  "aprovado",
  "reprovado",
]);

// Início do multi-empresa (ver plano de escalabilidade): por enquanto só
// esta tabela e users.organization_id existem — o resto do app
// (unidades, checklists, requisições etc.) ainda não está isolado por
// empresa. Isso é intencional: o passo grande de colocar organization_id
// em toda tabela existente fica pra depois; por ora, só o que é novo
// (motor de formulários, upload de arquivo) já nasce multi-empresa.
export const organizations = pgTable(
  "organizations",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    // Usado como prefixo de storage (ex: "org-acme/evidencias/...") e em
    // URLs futuras — só letras minúsculas, números e hífen.
    slug: varchar("slug", { length: 100 }).notNull(),
    // "pending": recém-criada via /signup, aguardando aprovação manual no
    // /plataforma. "active": pode usar o sistema normalmente.
    status: varchar("status", { length: 20 }).default("active").notNull(),
    // Marca por empresa: quando nulos, a UI cai pro visual padrão da
    // Kenkyo (vermelho + logo genérica) em vez de quebrar.
    logoUrl: text("logo_url"),
    primaryColor: varchar("primary_color", { length: 7 }),
    // Ligação com o ERP Kenkyo, por empresa (antes eram env vars globais do
    // servidor — a Kenkyo continua funcionando por causa do fallback na
    // leitura). Nulos = empresa sem ERP: os módulos de ERP ficam escondidos
    // e as requisições ficam pendentes aqui.
    erpApiUrl: text("erp_api_url"),
    erpApiToken: text("erp_api_token"),
    // Escala de folgas (ex.: 5x2): só vale a partir desta data. Antes dela,
    // todo mundo é esperado todo dia, como sempre foi. Null = sem escala.
    escalaVigenteDesde: date("escala_vigente_desde", { mode: "string" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("organizations_slug_idx").on(table.slug)],
);

export const units = pgTable(
  "units",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    // Qual empresa do ERP é esta unidade (CNPJ, só dígitos) e de qual local
    // de estoque do ERP sai a requisição interna (da própria unidade) e a
    // externa (estoque central). Ids são do ERP, não deste banco.
    erpCnpj: varchar("erp_cnpj", { length: 14 }),
    erpLocalInternoId: integer("erp_local_interno_id"),
    erpLocalExternoId: integer("erp_local_externo_id"),
  },
  (table) => [uniqueIndex("units_org_name_idx").on(table.organizationId, table.name)],
);

export const jobFunctions = pgTable(
  "job_functions",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    // O setor do ERP desta função (Bar, Sushibar, Produção…). Na requisição,
    // quem tem setor vê só os produtos que o ERP marca para ele (produto sem
    // setor no ERP aparece para todos). Vazio = vê o catálogo inteiro.
    erpSetor: varchar("erp_setor", { length: 60 }),
  },
  (table) => [uniqueIndex("job_functions_org_name_idx").on(table.organizationId, table.name)],
);

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    // Nullable só durante a migração de backfill — todo usuário novo
    // sempre tem uma empresa. Ver comentário acima de `organizations`.
    organizationId: integer("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    name: varchar("name", { length: 255 }).notNull(),
    username: varchar("username", { length: 255 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    profile: profileEnum("profile").notNull(),
    unitId: integer("unit_id").references(() => units.id, {
      onDelete: "set null",
    }),
    jobFunctionId: integer("job_function_id").references(
      () => jobFunctions.id,
      { onDelete: "set null" },
    ),
    // Dias da semana de folga fixa (0=domingo..6=sábado). Só conta a partir
    // de organizations.escala_vigente_desde.
    // false = não tem checklist obrigatório (ex.: quem coordena e só cobre alguém na
    // operação de vez em quando): não entra no atraso, no "sem checklist hoje" nem
    // nos indicadores, a menos que de fato comece um checklist no dia.
    checklistObrigatorio: boolean("checklist_obrigatorio").notNull().default(true),
    folgaDias: integer("folga_dias").array().notNull().default(sql`'{}'::integer[]`),
    // Unidades além da própria cujas requisições a pessoa também vê e confere (ex.: gerente que atende duas unidades).
    requisicaoUnidadesExtras: integer("requisicao_unidades_extras").array().notNull().default(sql`'{}'::integer[]`),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("users_username_idx").on(table.username)],
);

export const checklistTypes = pgTable("checklist_types", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description").notNull().default(""),
  // "HH:MM" (horário de Brasília) até quando o checklist deveria estar
  // concluído — base da nota de Pontualidade. Nulo = sem horário-limite.
  deadlineTime: varchar("deadline_time", { length: 5 }),
  // false = arquivado: some das listas e dos indicadores, mas as respostas
  // antigas continuam no Histórico.
  active: boolean("active").notNull().default(true),
  type: checklistTypeEnum("type").notNull(),
  jobFunctionId: integer("job_function_id").references(
    () => jobFunctions.id,
    { onDelete: "set null" },
  ),
  assignedUserId: integer("assigned_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const checklistTypeItems = pgTable("checklist_type_items", {
  id: serial("id").primaryKey(),
  checklistTypeId: integer("checklist_type_id")
    .notNull()
    .references(() => checklistTypes.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  position: integer("position").notNull(),
  requiresPhoto: boolean("requires_photo").notNull().default(false),
  // When true, this item can only be marked "conforme" if the user has
  // already submitted a diário de bordo (shift_logs row) for that date —
  // see setChecklistItemStatus.
  requiresShiftLog: boolean("requires_shift_log").notNull().default(false),
  // When true, this item can only be marked "conforme" if the user has
  // already criado a requisição de estoque (interna ou externa) nesse dia
  // de checklist — see setChecklistItemStatus.
  requiresRequisicao: boolean("requires_requisicao").notNull().default(false),
  // When true, this item can only be marked "conforme" if the ERP shows the
  // week's full stock count (contagem total dos últimos 7 dias, entregue ou
  // toda contada) for every active location of the unit — see
  // setChecklistItemStatus and the ERP's GET /api/contagens (`semana`).
  requiresContagem: boolean("requires_contagem").notNull().default(false),
});

// Pré-requisito configurável entre modelos de checklist — ex: "Fechamento"
// só libera depois que "Abertura" e "Meio de Turno" estiverem 100%
// respondidos no dia (ver getUnmetPrerequisites, aplicado em
// setChecklistItemStatus). Configurado em Gerenciar > Modelos de Checklist.
export const checklistTypePrerequisites = pgTable(
  "checklist_type_prerequisites",
  {
    id: serial("id").primaryKey(),
    checklistTypeId: integer("checklist_type_id")
      .notNull()
      .references(() => checklistTypes.id, { onDelete: "cascade" }),
    requiresChecklistTypeId: integer("requires_checklist_type_id")
      .notNull()
      .references(() => checklistTypes.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("checklist_type_prereq_idx").on(
      table.checklistTypeId,
      table.requiresChecklistTypeId,
    ),
  ],
);

// Deprecated: superseded by checklistTypes/checklistTypeItems, which now
// hold everything a "Modelo de Checklist" needs (including a fixed tipo).
// Kept only so the one-off migrate-templates-to-checklists.ts script can
// copy any leftover rows before these tables are dropped in a follow-up
// migration.
export const templates = pgTable("templates", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description").notNull().default(""),
  jobFunctionId: integer("job_function_id").references(
    () => jobFunctions.id,
    { onDelete: "set null" },
  ),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const templateItems = pgTable("template_items", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id")
    .notNull()
    .references(() => templates.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  position: integer("position").notNull(),
});

export const checklistCompletions = pgTable(
  "checklist_completions",
  {
    id: serial("id").primaryKey(),
    checklistTypeId: integer("checklist_type_id")
      .notNull()
      .references(() => checklistTypes.id, { onDelete: "cascade" }),
    itemId: integer("item_id")
      .notNull()
      .references(() => checklistTypeItems.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    status: completionStatusEnum("status").notNull().default("pending"),
    justification: text("justification"),
    photoUrl: text("photo_url"),
    completedAt: timestamp("completed_at"),
    // The unit this completion counts toward — normally the user's own
    // unit, but a gerente/chefe covering another unit for the day can
    // override it (see lib/auth/covering-unit.ts). Nullable because rows
    // written before this column existed don't have it; queries fall back
    // to the user's own unit_id for those via COALESCE.
    unitId: integer("unit_id").references(() => units.id, { onDelete: "set null" }),
  },
  (table) => [
    // Includes unitId (not just item/user/date) so a gerente/chefe who
    // covers another unit today can complete the same checklist template
    // separately for their own unit and the covered one, instead of the
    // second submission silently overwriting the first.
    uniqueIndex("completions_item_user_date_unit_idx").on(
      table.itemId,
      table.userId,
      table.date,
      table.unitId,
    ),
  ],
);

export const filletingRecords = pgTable("filleting_records", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  unitId: integer("unit_id")
    .notNull()
    .references(() => units.id, { onDelete: "cascade" }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  responsavel: varchar("responsavel", { length: 255 }),
  fishType: varchar("fish_type", { length: 255 }).notNull(),
  recebidoKg: numeric("recebido_kg", { precision: 10, scale: 3 }).notNull(),
  fileKg: numeric("file_kg", { precision: 10, scale: 3 }).notNull(),
  pontaClaraKg: numeric("ponta_clara_kg", {
    precision: 10,
    scale: 3,
  }).notNull(),
  pontaEscuraKg: numeric("ponta_escura_kg", {
    precision: 10,
    scale: 3,
  }).notNull(),
  pelesKg: numeric("peles_kg", { precision: 10, scale: 3 }).notNull(),
  raspasKg: numeric("raspas_kg", { precision: 10, scale: 3 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const restoIngestaRecords = pgTable("resto_ingesta_records", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  unitId: integer("unit_id")
    .notNull()
    .references(() => units.id, { onDelete: "cascade" }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  experienciasVendidas: integer("experiencias_vendidas").notNull(),
  desperdicioKg: numeric("desperdicio_kg", {
    precision: 10,
    scale: 3,
  }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // Quando chegou ao ERP (lib/erp/ocorrencias.ts). Nulo = falta mandar.
  erpEnviadoEm: timestamp("erp_enviado_em"),
});

// Controle do Líder de Bar (ver lib/data/utensil-breakage.ts).
export const utensilBreakageRecords = pgTable("utensil_breakage_records", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  unitId: integer("unit_id")
    .notNull()
    .references(() => units.id, { onDelete: "cascade" }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  item: varchar("item", { length: 255 }).notNull(),
  quantidade: integer("quantidade").notNull(),
  motivo: text("motivo"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Controle do Líder de Delivery (ver lib/data/delivery-errors.ts).
export const deliveryErrorRecords = pgTable("delivery_error_records", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  unitId: integer("unit_id")
    .notNull()
    .references(() => units.id, { onDelete: "cascade" }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  totalPedidos: integer("total_pedidos").notNull(),
  pedidosComErro: integer("pedidos_com_erro").notNull(),
  motivo: text("motivo"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  category: documentCategoryEnum("category").notNull(),
  subcategory: varchar("subcategory", { length: 100 }),
  fileUrl: text("file_url").notNull(),
  createdBy: integer("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const anomalies = pgTable(
  "anomalies",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    unitId: integer("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    relator: varchar("relator", { length: 255 }).notNull(),
    tipos: text("tipos").array().notNull(),
    setores: text("setores").array().notNull(),
    colaboradoresEnvolvidos: text("colaboradores_envolvidos").notNull(),
    oQueAconteceu: text("o_que_aconteceu").notNull(),
    causaPercebida: text("causa_percebida").notNull(),
    consequenciaImediata: text("consequencia_imediata"),
    acaoTomada: text("acao_tomada"),
    sugestaoTratativa: text("sugestao_tratativa"),
    status: anomalyStatusEnum("status").notNull().default("aberta"),
    // Set only for anomalies generated automatically from a "não conforme"
    // checklist item — lets that path avoid creating a duplicate anomaly
    // if the same item is resaved (e.g. justification edited).
    sourceChecklistCompletionId: integer("source_checklist_completion_id").references(
      () => checklistCompletions.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    // Quando a ocorrência chegou ao ERP (lib/erp/ocorrencias.ts). Nulo = falta
    // mandar (nova, tratada depois, ou o ERP estava fora do ar).
    erpEnviadaEm: timestamp("erp_enviada_em"),
  },
  (table) => [
    uniqueIndex("anomalies_source_completion_idx").on(
      table.sourceChecklistCompletionId,
    ),
  ],
);

// Um diário de bordo por pessoa por dia — imposto em createShiftLog
// (lib/actions/shift-logs.ts), não aqui: registros duplicados antigos já
// existiam em produção antes dessa regra, então uma unique constraint no
// banco quebraria a migração. Qualquer outra ocorrência no mesmo dia deve
// virar anomalia, não um segundo diário.
export const shiftLogs = pgTable("shift_logs", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  unitId: integer("unit_id")
    .notNull()
    .references(() => units.id, { onDelete: "cascade" }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  setor: varchar("setor", { length: 255 }).notNull(),
  statusTurno: shiftStatusEnum("status_turno").notNull(),
  statusJustificativa: text("status_justificativa").notNull(),
  desvioDescricao: text("desvio_descricao").notNull(),
  desvioImpacto: text("desvio_impacto"),
  desvioCausaRaiz: text("desvio_causa_raiz"),
  acoesLideranca: text("acoes_lideranca").array().notNull(),
  acaoLiderancaDescricao: text("acao_lideranca_descricao"),
  outrasDecisoes: text("outras_decisoes"),
  gestaoEquipe: text("gestao_equipe").array().notNull(),
  gestaoEquipeDescricao: text("gestao_equipe_descricao"),
  autoavaliacao: leaderSelfAssessmentEnum("autoavaliacao").notNull(),
  autoavaliacaoMelhorias: text("autoavaliacao_melhorias"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const shiftLogPendencias = pgTable("shift_log_pendencias", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .references(() => organizations.id, { onDelete: "cascade" }),
  shiftLogId: integer("shift_log_id")
    .notNull()
    .references(() => shiftLogs.id, { onDelete: "cascade" }),
  descricao: text("descricao").notNull(),
  responsavel: varchar("responsavel", { length: 255 }),
  prazo: date("prazo"),
  concluida: boolean("concluida").notNull().default(false),
});

// Catálogo de itens de estoque — base para o módulo de requisição
// (checklist-kenkyo/spec-requisicao-kenkyo.md). Só o perfil "gestor" edita
// categorias e produtos (ver requireGestor em lib/actions/catalog.ts).
export const catalogCategories = pgTable(
  "catalog_categories",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    // Dias da semana (0=domingo..6=sábado) em que essa categoria costuma
    // ter pedido de fornecedor — configuração global (vale pra todas as
    // unidades), usada só pra avisar na tela de nova requisição. Ver
    // spec-requisicao-kenkyo.md seção 5.
    orderDays: integer("order_days").array().notNull().default([]),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("catalog_categories_org_name_idx").on(table.organizationId, table.name)],
);

export const catalogItems = pgTable(
  "catalog_items",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    categoryId: integer("category_id").references(() => catalogCategories.id, {
      onDelete: "set null",
    }),
    unitMeasure: catalogUnitMeasureEnum("unit_measure").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    // O item do ERP (pelo código) e quanto da unidade de uso dele vem em 1
    // unidade deste produto: pedido em g e ERP em KG → 0,001.
    erpItemCodigo: varchar("erp_item_codigo", { length: 60 }),
    erpFator: numeric("erp_fator", { precision: 14, scale: 6 }),
    // Desativado = saiu do catálogo (o espelho do ERP não tem mais), mas já
    // foi pedido: some das listas e o histórico continua apontando para ele.
    ativo: boolean("ativo").default(true).notNull(),
  },
  (table) => [uniqueIndex("catalog_items_org_name_idx").on(table.organizationId, table.name)],
);

// Requisição de estoque — interna (fica na unidade) ou externa (sai pra
// fornecedor/estoque geral). Sem aprovação: nasce "aberta" e vira
// "conferida" quando o Líder de Estoque/Produção confirma o que realmente
// saiu/foi entregue (ver lib/auth/requisicoes.ts e
// spec-requisicao-kenkyo.md).
export const requisicoes = pgTable("requisicoes", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  tipo: requisicaoTipoEnum("tipo").notNull(),
  unitId: integer("unit_id")
    .notNull()
    .references(() => units.id, { onDelete: "cascade" }),
  requesterId: integer("requester_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  urgente: boolean("urgente").notNull().default(false),
  observacao: text("observacao").notNull().default(""),
  status: requisicaoStatusEnum("status").notNull().default("aberta"),
  conferidoPorId: integer("conferido_por_id").references(() => users.id, {
    onDelete: "set null",
  }),
  // Preenchido quando essa requisição é o excedente de algo que já foi
  // pedido antes no mesmo dia (ex: esqueceram um item, ou pediram pouco
  // e precisaram pegar mais à noite) — em vez de editar o pedido
  // original e perder o rastro do que foi previsto vs. do que faltou,
  // abre-se uma nova requisição apontando pra essa. onDelete "set null":
  // a original pode ser cancelada sem arrastar o excedente junto.
  relatedRequisicaoId: integer("related_requisicao_id").references(
    (): AnyPgColumn => requisicoes.id,
    { onDelete: "set null" },
  ),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  editedAt: timestamp("edited_at"),
  concluidoEm: timestamp("concluido_em"),
  // Só na externa: a unidade confirma o que chegou depois da conferência.
  recebidoEm: timestamp("recebido_em"),
  recebidoPorId: integer("recebido_por_id").references(() => users.id, { onDelete: "set null" }),
  recebimentoObs: text("recebimento_obs"),
  erpStatus: erpEnvioStatusEnum("erp_status").notNull().default("nao_enviada"),
  erpNumero: varchar("erp_numero", { length: 30 }),
  erpMensagem: text("erp_mensagem"),
  erpEnviadoEm: timestamp("erp_enviado_em"),
});

export const requisicaoItens = pgTable("requisicao_itens", {
  id: serial("id").primaryKey(),
  requisicaoId: integer("requisicao_id")
    .notNull()
    .references(() => requisicoes.id, { onDelete: "cascade" }),
  // Nullable: o item pode ter sido removido do catálogo depois, ou ser um
  // item personalizado adicionado só nesse pedido (mesma lógica do
  // protótipo). nome/unidadeMedida ficam sempre gravados aqui, não
  // dependem de um join, pra manter o histórico estável.
  catalogItemId: integer("catalog_item_id").references(() => catalogItems.id, {
    onDelete: "set null",
  }),
  nome: varchar("nome", { length: 255 }).notNull(),
  unidadeMedida: catalogUnitMeasureEnum("unidade_medida").notNull(),
  qtdPedida: numeric("qtd_pedida", { precision: 10, scale: 3 }).notNull(),
  qtdConferida: numeric("qtd_conferida", { precision: 10, scale: 3 }),
  qtdRecebida: numeric("qtd_recebida", { precision: 10, scale: 3 }),
  // Só na externa: "emporio" (o Empório separa e confere) ou "compras" (chega
  // por compra direta: vira solicitação de compra no ERP). Decidido pelo ERP
  // (como o item chega na unidade); null = ainda não decidido.
  destino: varchar("destino", { length: 10 }),
});

// Solicitação de item avulso (ex: rádio comunicador, lâmpada do
// aquecedor) — diferente de requisicoes (consumo de estoque, sem
// aprovação): aqui todo pedido passa por aprovação antes da compra.
// Desde 22/10/2026 a aprovação, a compra e a previsão de entrega ficam no
// ERP (Compras › Solicitações); o checklist pede, acompanha o prazo e dá o
// ok quando chega (lib/erp/solicitacoes.ts). status/comprado/
// dataPrevistaEntrega/motivoReprovacao dos itens são a cópia do que o ERP diz.
export const solicitacoes = pgTable("solicitacoes", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  unitId: integer("unit_id")
    .notNull()
    .references(() => units.id, { onDelete: "cascade" }),
  requesterId: integer("requester_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  urgente: boolean("urgente").notNull().default(false),
  observacao: text("observacao").notNull().default(""),
  status: solicitacaoStatusEnum("status").notNull().default("aberta"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // Quando foi para o ERP (Compras › Solicitações): lá se aprova, compra e põe a previsão; null = ainda não foi
  erpEnviadaEm: timestamp("erp_enviada_em"),
});

export const solicitacaoItens = pgTable("solicitacao_itens", {
  id: serial("id").primaryKey(),
  solicitacaoId: integer("solicitacao_id")
    .notNull()
    .references(() => solicitacoes.id, { onDelete: "cascade" }),
  nome: varchar("nome", { length: 255 }).notNull(),
  quantidade: integer("quantidade").notNull(),
  // Aprovação é por item — o gestor pode aprovar uns e reprovar outros
  // do mesmo pedido.
  status: solicitacaoItemStatusEnum("status").notNull().default("pendente"),
  aprovadoPorId: integer("aprovado_por_id").references(() => users.id, {
    onDelete: "set null",
  }),
  aprovadoEm: timestamp("aprovado_em"),
  motivoReprovacao: text("motivo_reprovacao"),
  // Preenchidos pelo gestor depois de aprovado, item a item — itens do
  // mesmo pedido podem ser comprados/entregues em momentos diferentes.
  comprado: boolean("comprado").notNull().default(false),
  dataPrevistaEntrega: date("data_prevista_entrega"),
  // Marcado por quem solicitou (ou pelo gestor) quando o item chega —
  // é o que fecha o acompanhamento do pedido.
  chegou: boolean("chegou").notNull().default(false),
});

// Motor de formulários genérico (plano de escalabilidade, passo 2) —
// pra um cliente configurar o próprio registro operacional (ex:
// "temperatura de câmara fria") sem precisar de código novo, do jeito
// que filetagem/resto-ingesta/quebra de utensílios/pedidos com erro
// tiveram que ser feitos hoje. Esses quatro continuam como módulos
// dedicados por enquanto — não foram migrados pra cá ainda.
export const formFieldTypeEnum = pgEnum("form_field_type", [
  "number",
  "text",
  "date",
  "boolean",
  "select",
]);

export const formDefinitions = pgTable("form_definitions", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description").notNull().default(""),
  // Array de { key, label, type, required, decimals?, unit?, options?
  // } — o "fields" inteiro é a definição do formulário, editável em
  // Gerenciar sem deploy novo. Ver lib/data/form-definitions.ts pro
  // shape exato e a validação.
  fields: jsonb("fields").notNull().default([]),
  // Nomes de função (job_functions.name) que podem preencher — nome,
  // não id, porque comparar por nome é o mesmo padrão já usado nos
  // outros módulos (canSubmitFilleting etc.) e job_functions é uma
  // tabela editável, não um enum fixo.
  allowedJobFunctionNames: jsonb("allowed_job_function_names").notNull().default([]),
  allowGestor: boolean("allow_gestor").notNull().default(true),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const formSubmissions = pgTable("form_submissions", {
  id: serial("id").primaryKey(),
  formDefinitionId: integer("form_definition_id")
    .notNull()
    .references(() => formDefinitions.id, { onDelete: "cascade" }),
  // Duplicado do form_definitions pra não precisar de join em toda
  // leitura escopada por empresa.
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  unitId: integer("unit_id").references(() => units.id, { onDelete: "set null" }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  // { [fieldKey]: valor } — valida contra form_definitions.fields na
  // escrita (lib/actions/form-definitions.ts), não no banco.
  values: jsonb("values").notNull().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const history = pgTable("history", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  status: historyStatusEnum("status").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Auditoria de unidade (visita técnica) — só Gestor. O modelo (grupos e
// itens) é editável por empresa em Gerenciar; cada auditoria guarda uma
// cópia do texto de grupo/item respondido, pra edição posterior do
// modelo não reescrever auditorias antigas.
export const auditAnswerStatusEnum = pgEnum("audit_answer_status", [
  "conforme",
  "parcial",
  "nao_conforme",
  "nao_aplica",
]);

export const auditGroups = pgTable("audit_groups", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  position: integer("position").notNull().default(0),
});

export const auditItems = pgTable("audit_items", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id")
    .notNull()
    .references(() => auditGroups.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  position: integer("position").notNull().default(0),
  // 3 = Crítico, 2 = Maior, 1 = Menor
  weight: integer("weight").notNull().default(1),
  howToVerify: text("how_to_verify").notNull().default(""),
  responsible: varchar("responsible", { length: 255 }).notNull().default(""),
  appliesTo: varchar("applies_to", { length: 255 }).notNull().default("Todas"),
});

export const audits = pgTable("audits", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  unitId: integer("unit_id")
    .notNull()
    .references(() => units.id, { onDelete: "cascade" }),
  auditorId: integer("auditor_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // Gestor convidado a avaliar em conjunto (opcional).
  coAuditorId: integer("co_auditor_id").references(() => users.id, { onDelete: "set null" }),
  visitDate: date("visit_date").notNull(),
  // "rascunho" enquanto preenche; "finalizada" congela a nota.
  status: varchar("status", { length: 20 }).notNull().default("rascunho"),
  scorePercent: integer("score_percent"),
  comments: text("comments").notNull().default(""),
  actionPlan: text("action_plan").notNull().default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  finalizedAt: timestamp("finalized_at"),
});

export const auditAnswers = pgTable("audit_answers", {
  id: serial("id").primaryKey(),
  auditId: integer("audit_id")
    .notNull()
    .references(() => audits.id, { onDelete: "cascade" }),
  groupName: varchar("group_name", { length: 255 }).notNull(),
  groupPosition: integer("group_position").notNull().default(0),
  itemLabel: text("item_label").notNull(),
  itemPosition: integer("item_position").notNull().default(0),
  weight: integer("weight").notNull().default(1),
  howToVerify: text("how_to_verify").notNull().default(""),
  responsible: varchar("responsible", { length: 255 }).notNull().default(""),
  appliesTo: varchar("applies_to", { length: 255 }).notNull().default("Todas"),
  status: auditAnswerStatusEnum("status"),
  note: text("note").notNull().default(""),
  photoUrls: jsonb("photo_urls").notNull().default([]),
});

// Exceção pontual à folga fixa da pessoa (rodízio, troca de folga, cobertura):
// "folga" = não é esperada nesse dia; "trabalho" = é esperada mesmo sendo o
// dia de folga fixa.
export const escalaExcecoes = pgTable(
  "escala_excecoes",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    tipo: varchar("tipo", { length: 10 }).notNull(),
  },
  (table) => [uniqueIndex("escala_excecoes_user_date_idx").on(table.userId, table.date)],
);

// Celulares que ativaram os avisos (push). Uma pessoa pode ter vários aparelhos.
export const pushInscricoes = pgTable(
  "push_inscricoes",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("push_inscricoes_endpoint_idx").on(table.endpoint)],
);

// Avisos automáticos já enviados (lembrete de prazo/atraso), para não repetir.
export const pushEnvios = pgTable(
  "push_envios",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    chave: varchar("chave", { length: 120 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("push_envios_user_chave_idx").on(table.userId, table.chave)],
);

// Rotinas pessoais: listas que cada pessoa monta para si (privadas), com dias da
// semana e, se quiser, um horário de lembrete por push.
export const rotinasPessoais = pgTable("rotinas_pessoais", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  nome: varchar("nome", { length: 120 }).notNull(),
  // dias da semana em que vale (0 = domingo … 6 = sábado); vazio = todos os dias
  dias: integer("dias").array().notNull().default(sql`'{}'::integer[]`),
  lembreteHora: varchar("lembrete_hora", { length: 5 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const rotinaItens = pgTable("rotina_itens", {
  id: serial("id").primaryKey(),
  rotinaId: integer("rotina_id")
    .notNull()
    .references(() => rotinasPessoais.id, { onDelete: "cascade" }),
  texto: varchar("texto", { length: 200 }).notNull(),
  posicao: integer("posicao").notNull().default(0),
});

export const rotinaMarcas = pgTable(
  "rotina_marcas",
  {
    id: serial("id").primaryKey(),
    itemId: integer("item_id")
      .notNull()
      .references(() => rotinaItens.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    doneAt: timestamp("done_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("rotina_marcas_item_date_idx").on(table.itemId, table.date)],
);

// Dia fechado pela pessoa (Resumo do dia › Fechar o dia): guarda o resumo na hora e uma observação.
export const fechamentosDia = pgTable(
  "fechamentos_dia",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    nota: text("nota"),
    resumo: jsonb("resumo").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("fechamentos_dia_user_date_idx").on(table.userId, table.date)],
);

// Quem pediu contato pela página de venda.
export const interesses = pgTable("interesses", {
  id: serial("id").primaryKey(),
  nome: varchar("nome", { length: 120 }).notNull(),
  empresa: varchar("empresa", { length: 120 }),
  contato: varchar("contato", { length: 160 }).notNull(),
  mensagem: text("mensagem"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Plano de ação em ciclo PDCA, nascido de uma ou mais anomalias.
// etapa: plan | do | check | act | encerrado. Cada novo ciclo é outro plano (ciclo + 1) apontando para o anterior.
export const planosAcao = pgTable("planos_acao", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  titulo: varchar("titulo", { length: 160 }).notNull(),
  problema: text("problema").notNull(),
  causaRaiz: text("causa_raiz").notNull().default(""),
  meta: text("meta").notNull().default(""),
  etapa: varchar("etapa", { length: 12 }).notNull().default("plan"),
  ciclo: integer("ciclo").notNull().default(1),
  planoOrigemId: integer("plano_origem_id").references((): AnyPgColumn => planosAcao.id, { onDelete: "set null" }),
  criadoPorId: integer("criado_por_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  verificarEm: date("verificar_em", { mode: "string" }),
  verificacaoResultado: varchar("verificacao_resultado", { length: 12 }), // eficaz | parcial | nao_eficaz
  verificacaoNota: text("verificacao_nota"),
  padronizacaoNota: text("padronizacao_nota"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  encerradoEm: timestamp("encerrado_em"),
});

export const planoAnomalias = pgTable(
  "plano_anomalias",
  {
    id: serial("id").primaryKey(),
    planoId: integer("plano_id")
      .notNull()
      .references(() => planosAcao.id, { onDelete: "cascade" }),
    anomaliaId: integer("anomalia_id")
      .notNull()
      .references(() => anomalies.id, { onDelete: "cascade" }),
  },
  (table) => [uniqueIndex("plano_anomalias_idx").on(table.planoId, table.anomaliaId)],
);

// status: a_fazer | em_andamento | feita
export const planoAcoes = pgTable("plano_acoes", {
  id: serial("id").primaryKey(),
  planoId: integer("plano_id")
    .notNull()
    .references(() => planosAcao.id, { onDelete: "cascade" }),
  descricao: text("descricao").notNull(),
  responsavelId: integer("responsavel_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  prazo: date("prazo", { mode: "string" }).notNull(),
  status: varchar("status", { length: 14 }).notNull().default("a_fazer"),
  notaExecucao: text("nota_execucao"),
  concluidoEm: timestamp("concluido_em"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

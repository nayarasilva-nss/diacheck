CREATE TABLE "plano_acoes" (
	"id" serial PRIMARY KEY NOT NULL,
	"plano_id" integer NOT NULL,
	"descricao" text NOT NULL,
	"responsavel_id" integer NOT NULL,
	"prazo" date NOT NULL,
	"status" varchar(14) DEFAULT 'a_fazer' NOT NULL,
	"nota_execucao" text,
	"concluido_em" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plano_anomalias" (
	"id" serial PRIMARY KEY NOT NULL,
	"plano_id" integer NOT NULL,
	"anomalia_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "planos_acao" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"titulo" varchar(160) NOT NULL,
	"problema" text NOT NULL,
	"causa_raiz" text DEFAULT '' NOT NULL,
	"meta" text DEFAULT '' NOT NULL,
	"etapa" varchar(12) DEFAULT 'plan' NOT NULL,
	"ciclo" integer DEFAULT 1 NOT NULL,
	"plano_origem_id" integer,
	"criado_por_id" integer NOT NULL,
	"verificar_em" date,
	"verificacao_resultado" varchar(12),
	"verificacao_nota" text,
	"padronizacao_nota" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"encerrado_em" timestamp
);
--> statement-breakpoint
ALTER TABLE "plano_acoes" ADD CONSTRAINT "plano_acoes_plano_id_planos_acao_id_fk" FOREIGN KEY ("plano_id") REFERENCES "public"."planos_acao"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plano_acoes" ADD CONSTRAINT "plano_acoes_responsavel_id_users_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plano_anomalias" ADD CONSTRAINT "plano_anomalias_plano_id_planos_acao_id_fk" FOREIGN KEY ("plano_id") REFERENCES "public"."planos_acao"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plano_anomalias" ADD CONSTRAINT "plano_anomalias_anomalia_id_anomalies_id_fk" FOREIGN KEY ("anomalia_id") REFERENCES "public"."anomalies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planos_acao" ADD CONSTRAINT "planos_acao_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planos_acao" ADD CONSTRAINT "planos_acao_plano_origem_id_planos_acao_id_fk" FOREIGN KEY ("plano_origem_id") REFERENCES "public"."planos_acao"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planos_acao" ADD CONSTRAINT "planos_acao_criado_por_id_users_id_fk" FOREIGN KEY ("criado_por_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "plano_anomalias_idx" ON "plano_anomalias" USING btree ("plano_id","anomalia_id");
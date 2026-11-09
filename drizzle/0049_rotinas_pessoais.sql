CREATE TABLE "rotina_itens" (
	"id" serial PRIMARY KEY NOT NULL,
	"rotina_id" integer NOT NULL,
	"texto" varchar(200) NOT NULL,
	"posicao" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rotina_marcas" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"date" date NOT NULL,
	"done_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rotinas_pessoais" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"nome" varchar(120) NOT NULL,
	"dias" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"lembrete_hora" varchar(5),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rotina_itens" ADD CONSTRAINT "rotina_itens_rotina_id_rotinas_pessoais_id_fk" FOREIGN KEY ("rotina_id") REFERENCES "public"."rotinas_pessoais"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rotina_marcas" ADD CONSTRAINT "rotina_marcas_item_id_rotina_itens_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."rotina_itens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rotinas_pessoais" ADD CONSTRAINT "rotinas_pessoais_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rotinas_pessoais" ADD CONSTRAINT "rotinas_pessoais_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rotina_marcas_item_date_idx" ON "rotina_marcas" USING btree ("item_id","date");
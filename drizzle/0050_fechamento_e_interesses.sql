CREATE TABLE "fechamentos_dia" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"date" date NOT NULL,
	"nota" text,
	"resumo" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interesses" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" varchar(120) NOT NULL,
	"empresa" varchar(120),
	"contato" varchar(160) NOT NULL,
	"mensagem" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fechamentos_dia" ADD CONSTRAINT "fechamentos_dia_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fechamentos_dia" ADD CONSTRAINT "fechamentos_dia_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fechamentos_dia_user_date_idx" ON "fechamentos_dia" USING btree ("user_id","date");
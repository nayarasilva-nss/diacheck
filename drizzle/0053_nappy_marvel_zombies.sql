CREATE TABLE "checklist_item_hidden" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"user_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklist_type_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"checklist_type_id" integer NOT NULL,
	"user_id" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "checklist_type_items" ADD COLUMN "owner_user_id" integer;--> statement-breakpoint
ALTER TABLE "checklist_item_hidden" ADD CONSTRAINT "checklist_item_hidden_item_id_checklist_type_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."checklist_type_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_item_hidden" ADD CONSTRAINT "checklist_item_hidden_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_type_users" ADD CONSTRAINT "checklist_type_users_checklist_type_id_checklist_types_id_fk" FOREIGN KEY ("checklist_type_id") REFERENCES "public"."checklist_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_type_users" ADD CONSTRAINT "checklist_type_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "checklist_item_hidden_idx" ON "checklist_item_hidden" USING btree ("item_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "checklist_type_users_idx" ON "checklist_type_users" USING btree ("checklist_type_id","user_id");--> statement-breakpoint
ALTER TABLE "checklist_type_items" ADD CONSTRAINT "checklist_type_items_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
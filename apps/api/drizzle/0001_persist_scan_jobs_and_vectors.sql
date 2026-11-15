CREATE TABLE "scan_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"ref_type" text NOT NULL,
	"ref" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"project_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vector_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb NOT NULL,
	"embedding" real[]
);
--> statement-breakpoint
ALTER TABLE "scan_jobs" ADD CONSTRAINT "scan_jobs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_jobs" ADD CONSTRAINT "scan_jobs_project_id_sboms_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."sboms"("project_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vector_documents" ADD CONSTRAINT "vector_documents_project_id_sboms_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."sboms"("project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scan_jobs_user_id_idx" ON "scan_jobs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "vector_documents_project_id_idx" ON "vector_documents" USING btree ("project_id");
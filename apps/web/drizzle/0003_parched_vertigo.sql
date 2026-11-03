CREATE TABLE "quotation_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_hash" text NOT NULL,
	"challenge" text NOT NULL,
	"token_hash" text,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"audience" text NOT NULL,
	"code_expires_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quotation_connections_code_hash_unique" UNIQUE("code_hash"),
	CONSTRAINT "quotation_connections_token_hash_unique" UNIQUE("token_hash")
);

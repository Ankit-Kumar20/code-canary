# Agent Guidelines

## Database

The API uses Drizzle ORM with PostgreSQL (`apps/api/src/db/`, migrations in `apps/api/drizzle/`).

- Never apply changes to a database on your own. Do not run `db:migrate`, `db:push`, `drizzle-kit migrate`, `drizzle-kit push`, or the Better Auth `migrate` command, and do not run SQL that creates, alters, drops, or writes data.
- You may edit the schema and run `db:generate` to create migration files. Then tell the user which migration to apply and let them run it.
- Run these commands only when the user explicitly asks you to in the current conversation.

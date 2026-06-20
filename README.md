# Flowboard

A personal GTD command board: capture to an **Inbox**, **triage** into work,
move items across a **Kanban** (backlog / next / now / waiting / done), think on
a draggable **Whiteboard**, and watch an **Activity** feed of everything you do.

Stack: Next.js 16 (App Router) + TypeScript + Tailwind v4 + Prisma 7 with
better-sqlite3 + zod. No external network dependency at runtime (an Ollama LLM
is optional for triage; the board ships a local heuristic fallback).

## Run the demo

```bash
pnpm install      # installs deps; postinstall runs `prisma generate`
pnpm setup        # prisma generate + db push + seed demo data
pnpm dev          # http://localhost:3000
```

`pnpm setup` prints `Seeded: { inbox: 6, work: 10, notes: 5, activity: 8 }`.

Reset the demo data anytime (re-seeds, idempotent):

```bash
pnpm db:reset
```

## Scripts

- `dev` / `start` - run on port **3000**
- `build` - `prisma generate && next build`
- `db:push` - push the Prisma schema into the SQLite DB
- `db:seed` - run `prisma/seed.ts` (idempotent demo data)
- `db:reset` - force-reset the schema and re-seed
- `setup` - generate + push + seed in one shot

## Data

SQLite lives at `data/flowboard.db` (gitignored), configured via `DATABASE_URL`
in `.env`. Four models: `InboxItem`, `WorkItem`, `WhiteboardNote`, `ActivityLog`.

## Optional: Ollama triage

The **Triage Inbox** button works fully offline using a deterministic local
heuristic. To enhance suggestions with a local LLM, set `OLLAMA_URL` (and
optionally `OLLAMA_MODEL`) in `.env` / `.env.local`. If Ollama is unreachable
the route silently falls back to the heuristic - it never blocks or errors.

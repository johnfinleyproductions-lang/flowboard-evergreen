# Changelog

All notable changes to **Flowboard** — a personal GTD command board: quick-capture
inbox → AI triage → work kanban → draggable whiteboard → activity feed.

This repository is the **standalone MVP origin**. As of 2026-06-26 Flowboard has been
ported into **Evergreen Core** (`app/(apps)/flowboard`), which is now the maintained
home. This changelog records the MVP history and that handoff.

## 2026-06-26 — Reviewed + ported into Evergreen Core

### Ported (lives in evergreen-core now)
- Migrated from **Next/Prisma/SQLite** (single-user, localhost) to **Drizzle/Postgres**
  inside Evergreen Core, scoped **per user + workspace** with Better Auth gating on every
  route, plus an App Hub tile. The standalone app here remains runnable as the origin
  reference.

### Fixed (from a multi-agent review, folded into the port)
- **Data loss on triage.** Applying a "reference" or "someday" suggestion previously
  **deleted the captured inbox text** without storing it anywhere. These kinds now persist
  as retained work items; only "trash" deletes.
- **Non-atomic triage apply.** Apply was a chain of separate client requests (create work →
  log → delete inbox) that could orphan a work item or drop the audit log on a mid-flow
  failure. It is now a single server-side database transaction.
- **Activity log is server-authored.** Logging moved out of the client into the same
  transaction as each mutation, so the Daily Review counts can't silently under-report.
- **Validation/error handling.** Malformed bodies now return 400 (not 500); stale ids return
  404; ids are validated as UUIDs; user strings have length caps.
- **Whiteboard drag.** Coordinates are rounded to integers (fractional values from browser
  zoom / DPR were being rejected and snapping notes back).
- **AI confidence** is clamped to 0–100% in the UI.

### Review summary
- 7-dimension review (data integrity, security, React state, AI triage, Core-port readiness,
  build/ops, architecture); 62 findings confirmed, 0 refuted. Headline: a clean ~1,400-line
  MVP; the only real today-bug was the triage data loss, and the only hard port-blocker was
  the missing auth/ownership scoping — both resolved by the port.

## 2026-06-20 — MVP demo

### Added
- Initial Flowboard MVP: inbox quick-capture, work kanban (backlog/next/now/waiting/done,
  task/project), draggable whiteboard with persisted positions, activity feed, and offline
  AI triage (deterministic heuristic with an optional local-model enhancement).
- Next.js 16 / React 19 / Prisma 7 (better-sqlite3) / Tailwind 4 / zod. Seeded demo data;
  `pnpm setup && pnpm dev` on :3000.

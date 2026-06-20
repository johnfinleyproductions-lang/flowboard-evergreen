import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const url = process.env.DATABASE_URL ?? "file:./data/flowboard.db";
const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });

const minsAgo = (m: number) => new Date(Date.now() - m * 60_000);
const hrsAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

async function main() {
  // 1) idempotent wipe (no relations, so order is free)
  await prisma.activityLog.deleteMany();
  await prisma.whiteboardNote.deleteMany();
  await prisma.workItem.deleteMany();
  await prisma.inboxItem.deleteMany();

  // 2) inbox (6)
  await prisma.inboxItem.createMany({
    data: [
      { text: "Reply to Dana about the Q3 retro notes" },
      { text: "Idea: weekly 'one-metric' email to the team" },
      { text: "Renew domain before it lapses (~12 days)" },
      { text: "Read the Linear changelog on sub-issues" },
      { text: "Book dentist - overdue" },
      { text: "Should we sunset the v1 onboarding flow?" },
    ],
  });

  // 3) work (10) - spans all statuses, task+project, outcomes + nextActions
  const work = [
    {
      kind: "project",
      title: "Ship Flowboard MVP demo",
      status: "now",
      outcome: "A polished, seeded board that runs on :3000",
      nextAction: "Wire local triage fallback",
    },
    {
      kind: "task",
      title: "Fix sticky drag bounds",
      status: "now",
      outcome: "Notes can't be dragged off-canvas",
      nextAction: "Measure container via ref",
    },
    {
      kind: "task",
      title: "Draft the launch tweet",
      status: "next",
      outcome: "One crisp thread announcing the board",
      nextAction: "Write 3 hook variants",
    },
    {
      kind: "project",
      title: "Migrate analytics to self-host",
      status: "next",
      outcome: "No third-party tracker at runtime",
      nextAction: "Spike Plausible self-host",
    },
    {
      kind: "task",
      title: "Email accountant re: receipts",
      status: "waiting",
      outcome: "Q2 books reconciled",
      nextAction: "Awaiting reply from accountant",
    },
    {
      kind: "project",
      title: "Hire a part-time designer",
      status: "waiting",
      outcome: "Design help 10h/week",
      nextAction: "Waiting on 2 portfolio links",
    },
    {
      kind: "task",
      title: "Outline the onboarding rewrite",
      status: "backlog",
      outcome: "Clearer first-run experience",
      nextAction: "Collect 5 support tickets",
    },
    {
      kind: "project",
      title: "Redesign the marketing site",
      status: "backlog",
      outcome: "Higher trial conversion",
      nextAction: "Define first step",
    },
    {
      kind: "task",
      title: "Set up nightly DB backup",
      status: "done",
      outcome: "Data is recoverable",
      nextAction: null,
    },
    {
      kind: "task",
      title: "Pin dev/start to port 3000",
      status: "done",
      outcome: "Predictable local URL",
      nextAction: null,
    },
  ];
  for (const w of work) await prisma.workItem.create({ data: w });

  // 4) whiteboard (5) - positioned across the canvas
  await prisma.whiteboardNote.createMany({
    data: [
      { text: "NORTH STAR:\nweekly active boards", x: 40, y: 24, w: 220, h: 120 },
      { text: "Demo script:\n1. capture 2. triage 3. move", x: 300, y: 16, w: 240, h: 130 },
      { text: "Don't touch evergreen-core", x: 600, y: 30, w: 220, h: 110 },
      { text: "Color = kind\nblue task / orange project", x: 120, y: 150, w: 220, h: 110 },
      { text: "Stretch: drag between columns", x: 560, y: 150, w: 240, h: 110 },
    ],
  });

  // 5) activity (8) - recent, mixed event types so "today" stats populate
  await prisma.activityLog.createMany({
    data: [
      {
        eventType: "WORK_MOVED_TO_DONE",
        entityType: "work",
        entityId: "seed",
        note: 'Moved "Pin dev/start to port 3000" -> done',
        createdAt: minsAgo(8),
      },
      {
        eventType: "WORK_MOVED_TO_DONE",
        entityType: "work",
        entityId: "seed",
        note: 'Moved "Set up nightly DB backup" -> done',
        createdAt: minsAgo(22),
      },
      {
        eventType: "INBOX_TRIAGE_APPLIED",
        entityType: "inbox",
        entityId: "seed",
        note: 'Created task: "Draft the launch tweet" -> next',
        createdAt: minsAgo(35),
      },
      {
        eventType: "WORK_CREATED",
        entityType: "work",
        entityId: "seed",
        note: 'Created project: "Ship Flowboard MVP demo" -> now',
        createdAt: hrsAgo(1),
      },
      {
        eventType: "WHITEBOARD_NOTE_CREATED",
        entityType: "whiteboard",
        entityId: "seed",
        note: "Created sticky",
        createdAt: hrsAgo(2),
      },
      {
        eventType: "INBOX_CREATED",
        entityType: "inbox",
        entityId: "seed",
        note: 'Captured: "Book dentist - overdue"',
        createdAt: hrsAgo(3),
      },
      {
        eventType: "WORK_STATUS_CHANGED",
        entityType: "work",
        entityId: "seed",
        note: 'Moved "Fix sticky drag bounds" -> now',
        createdAt: hrsAgo(5),
      },
      {
        eventType: "INBOX_CREATED",
        entityType: "inbox",
        entityId: "seed",
        note: 'Captured: "Renew domain before it lapses"',
        createdAt: hrsAgo(26),
      },
    ],
  });

  const counts = {
    inbox: await prisma.inboxItem.count(),
    work: await prisma.workItem.count(),
    notes: await prisma.whiteboardNote.count(),
    activity: await prisma.activityLog.count(),
  };
  console.log("Seeded:", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

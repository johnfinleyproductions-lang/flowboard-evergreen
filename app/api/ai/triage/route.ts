import { NextResponse } from "next/server";
import { z } from "zod";

// Shape consumed by components/Flowboard.tsx (TriageSuggestion).
type TriageKind = "task" | "project" | "reference" | "someday" | "trash";
type WorkStatus = "backlog" | "next" | "now" | "waiting" | "done";

type TriageSuggestion = {
  inbox_id: string;
  kind: TriageKind;
  title: string;
  status: WorkStatus;
  next_action: string | null;
  clarifying_questions: string[];
  confidence: number;
};

const Body = z.object({
  inboxItems: z.array(z.object({ id: z.string(), text: z.string() })),
});

const WORD_RE = /\s+/;
const ACTION_VERBS = /\b(call|email|reply|send|schedule|book|pay|renew|message|ping|text)\b/i;
const DECIDE_LEAD = /^(who|what|when|how|should|could|would|do we|can we)\b/i;
const PROJECT_WORDS = /\b(plan|launch|build|design|migrate|rewrite|redesign|architect|roll ?out|overhaul)\b/i;
const REFERENCE_WORDS = /\b(read|watch|article|link|http|changelog|docs?|reference|skim)\b/i;
const SOMEDAY_WORDS = /\b(someday|maybe)\b|idea:/i;
const TRASH_RE = /^[\s\W]*$/;

// Title-case the leading verb to make an action-led next step.
function actionLed(text: string): string {
  const t = text.trim().replace(/[.?!]+$/, "");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function heuristic(id: string, raw: string): TriageSuggestion {
  const text = (raw ?? "").trim();

  // empty / junk -> trash
  if (!text || TRASH_RE.test(text)) {
    return {
      inbox_id: id,
      kind: "trash",
      title: text || "(empty)",
      status: "backlog",
      next_action: null,
      clarifying_questions: [],
      confidence: 0.9,
    };
  }

  const words = text.split(WORD_RE).filter(Boolean);
  const wordCount = words.length;

  // someday / maybe
  if (SOMEDAY_WORDS.test(text)) {
    return {
      inbox_id: id,
      kind: "someday",
      title: text.replace(/^idea:\s*/i, ""),
      status: "backlog",
      next_action: null,
      clarifying_questions: ["Is this worth a defined outcome yet?"],
      confidence: 0.7,
    };
  }

  // reference / read-later
  if (REFERENCE_WORDS.test(text)) {
    return {
      inbox_id: id,
      kind: "reference",
      title: text,
      status: "backlog",
      next_action: null,
      clarifying_questions: [],
      confidence: 0.72,
    };
  }

  // action verbs -> a concrete task to do now
  if (ACTION_VERBS.test(text)) {
    return {
      inbox_id: id,
      kind: "task",
      title: text,
      status: "now",
      next_action: actionLed(text),
      clarifying_questions: [],
      confidence: 0.8,
    };
  }

  // open question / decision
  if (text.includes("?") || DECIDE_LEAD.test(text)) {
    return {
      inbox_id: id,
      kind: "task",
      title: text.replace(/\?+$/, ""),
      status: "next",
      next_action: `Decide: ${text.replace(/\?+$/, "")}`,
      clarifying_questions: ["What outcome would make this a clear yes/no?"],
      confidence: 0.68,
    };
  }

  // multi-step / projecty work
  if (PROJECT_WORDS.test(text) || wordCount > 8) {
    return {
      inbox_id: id,
      kind: "project",
      title: text,
      status: "backlog",
      next_action: "Define first step",
      clarifying_questions: ["What does done look like?"],
      confidence: 0.66,
    };
  }

  // default -> a next task
  return {
    inbox_id: id,
    kind: "task",
    title: text,
    status: "next",
    next_action: actionLed(text),
    clarifying_questions: [],
    confidence: 0.6,
  };
}

// Optional Ollama enhancement. Never blocks: short timeout, any failure -> null.
async function tryOllama(
  items: { id: string; text: string }[]
): Promise<TriageSuggestion[] | null> {
  const base = process.env.OLLAMA_URL;
  const model = process.env.OLLAMA_MODEL ?? "llama3.2:3b";
  if (!base) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const prompt = [
      "You are a GTD triage assistant. For each inbox item, return JSON.",
      'Reply ONLY with a JSON array of objects with keys:',
      'inbox_id, kind (task|project|reference|someday|trash), title, status (backlog|next|now|waiting|done), next_action (string|null), clarifying_questions (string[]), confidence (0..1).',
      "Items:",
      JSON.stringify(items),
    ].join("\n");

    const res = await fetch(`${base.replace(/\/$/, "")}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt, stream: false, format: "json" }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { response?: string };
    if (!data.response) return null;

    const parsed = JSON.parse(data.response);
    const arr = Array.isArray(parsed) ? parsed : parsed.items;
    if (!Array.isArray(arr)) return null;

    // Validate / coerce against the known item ids; fall back per-item if malformed.
    const byId = new Map(items.map((i) => [i.id, i.text] as const));
    return items.map((i) => {
      const m = arr.find((x: any) => x?.inbox_id === i.id);
      if (!m || typeof m.title !== "string") return heuristic(i.id, byId.get(i.id) ?? "");
      return {
        inbox_id: i.id,
        kind: (["task", "project", "reference", "someday", "trash"].includes(m.kind)
          ? m.kind
          : "task") as TriageKind,
        title: m.title,
        status: (["backlog", "next", "now", "waiting", "done"].includes(m.status)
          ? m.status
          : "next") as WorkStatus,
        next_action: typeof m.next_action === "string" ? m.next_action : null,
        clarifying_questions: Array.isArray(m.clarifying_questions)
          ? m.clarifying_questions.filter((q: any) => typeof q === "string")
          : [],
        confidence: typeof m.confidence === "number" ? m.confidence : 0.6,
      };
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req: Request) {
  const { inboxItems } = Body.parse(await req.json());

  // Always have a deterministic local answer ready.
  const local = inboxItems.map((i) => heuristic(i.id, i.text));

  // Optionally enhance with Ollama; on any failure keep the local result.
  const enhanced = await tryOllama(inboxItems).catch(() => null);

  return NextResponse.json({ items: enhanced ?? local });
}

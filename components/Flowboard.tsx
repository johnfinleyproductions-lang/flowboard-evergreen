"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type InboxItem = { id: string; text: string; createdAt?: string };
type WorkStatus = "backlog" | "next" | "now" | "waiting" | "done";
type WorkKind = "task" | "project";

type WorkItem = {
  id: string;
  kind: WorkKind;
  title: string;
  status: WorkStatus;
  outcome?: string | null;
  nextAction?: string | null;
  createdAt?: string;
};

type WhiteboardNote = {
  id: string;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  createdAt?: string;
};

type Activity = {
  id: string;
  eventType: string;
  entityType: string;
  entityId: string;
  note: string;
  createdAt: string;
};

type TriageSuggestion = {
  inbox_id: string;
  kind: "task" | "project" | "reference" | "someday" | "trash";
  title: string;
  status: WorkStatus;
  next_action: string | null;
  clarifying_questions: string[];
  confidence: number;
};

const STATUS_LABEL: Record<WorkStatus, string> = {
  backlog: "Backlog",
  next: "Next",
  now: "Now",
  waiting: "Waiting",
  done: "Done",
};

const STATUS_ORDER: WorkStatus[] = ["backlog", "next", "now", "waiting", "done"];

// Per-column accent styling for the kanban headers.
const STATUS_CHIP: Record<WorkStatus, string> = {
  backlog: "bg-zinc-100 text-zinc-600 ring-zinc-200",
  next: "bg-sky-100 text-sky-700 ring-sky-200",
  now: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  waiting: "bg-amber-100 text-amber-700 ring-amber-200",
  done: "bg-zinc-200 text-zinc-500 ring-zinc-300",
};

// Sticky note color rotation for a lively whiteboard.
const STICKY_COLORS = [
  "bg-yellow-200/90",
  "bg-lime-200/90",
  "bg-sky-200/90",
  "bg-pink-200/90",
  "bg-orange-200/90",
];

function isHTML(s: string) {
  const t = s.trim();
  return t.startsWith("<!DOCTYPE html") || t.startsWith("<html");
}

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();
  if (!res.ok) throw new Error(isHTML(text) ? `Server error (${res.status}). Check terminal logs.` : text);
  return JSON.parse(text);
}

async function sendJSON<T>(url: string, method: string, body?: any): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(isHTML(text) ? `Server error (${res.status}). Check terminal logs.` : text);
  return JSON.parse(text);
}

function startOfTodayMs() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function timeAgo(iso: string) {
  const then = new Date(iso).getTime();
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 45) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function Flowboard() {
  const [error, setError] = useState<string | null>(null);

  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [work, setWork] = useState<WorkItem[]>([]);
  const [notes, setNotes] = useState<WhiteboardNote[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);

  const [inboxText, setInboxText] = useState("");
  const [workTitle, setWorkTitle] = useState("");
  const [workKind, setWorkKind] = useState<WorkKind>("task");
  const [workStatus, setWorkStatus] = useState<WorkStatus>("backlog");

  const [triaging, setTriaging] = useState(false);
  const [suggestions, setSuggestions] = useState<TriageSuggestion[]>([]);

  const boardRef = useRef<HTMLDivElement | null>(null);

  async function refreshAll() {
    setError(null);
    try {
      const [inb, wk, wb, act] = await Promise.all([
        getJSON<{ items: InboxItem[] }>("/api/inbox"),
        getJSON<{ items: WorkItem[] }>("/api/work"),
        getJSON<{ notes: WhiteboardNote[] }>("/api/whiteboard"),
        getJSON<{ items: Activity[] }>("/api/activity?limit=80"),
      ]);
      setInbox(inb.items ?? []);
      setWork(wk.items ?? []);
      setNotes(wb.notes ?? []);
      setActivity(act.items ?? []);
    } catch (e: any) {
      setError(e.message ?? "Failed to load");
    }
  }

  useEffect(() => {
    refreshAll();
  }, []);

  const workByStatus = useMemo(() => {
    const map: Record<WorkStatus, WorkItem[]> = { backlog: [], next: [], now: [], waiting: [], done: [] };
    for (const w of work) map[w.status].push(w);
    return map;
  }, [work]);

  const todayActivity = useMemo(() => {
    const from = startOfTodayMs();
    return activity.filter((a) => new Date(a.createdAt).getTime() >= from);
  }, [activity]);

  async function addInbox() {
    const text = inboxText.trim();
    if (!text) return;
    setInboxText("");
    setError(null);

    const temp: InboxItem = { id: `temp-${Math.random().toString(16).slice(2)}`, text };
    setInbox((p) => [temp, ...p]);

    try {
      const res = await sendJSON<{ item: InboxItem }>("/api/inbox", "POST", { text });
      setInbox((p) => [res.item, ...p.filter((x) => x.id !== temp.id)]);
      await sendJSON("/api/activity", "POST", {
        eventType: "INBOX_CREATED",
        entityType: "inbox",
        entityId: res.item.id,
        note: `Captured: "${res.item.text}"`,
      });
      refreshAll();
    } catch (e: any) {
      setInbox((p) => p.filter((x) => x.id !== temp.id));
      setError(e.message ?? "Failed to add inbox");
    }
  }

  async function deleteInbox(id: string) {
    setError(null);
    const prev = inbox;
    setInbox((cur) => cur.filter((x) => x.id !== id));
    try {
      await fetch(`/api/inbox?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      await sendJSON("/api/activity", "POST", {
        eventType: "INBOX_REMOVED",
        entityType: "inbox",
        entityId: id,
        note: "Removed from inbox",
      });
      refreshAll();
    } catch (e: any) {
      setInbox(prev);
      setError(e.message ?? "Failed to delete inbox item");
    }
  }

  async function addWork() {
    const title = workTitle.trim();
    if (!title) return;
    setWorkTitle("");
    setError(null);

    const temp: WorkItem = {
      id: `temp-${Math.random().toString(16).slice(2)}`,
      kind: workKind,
      title,
      status: workStatus,
      outcome: null,
      nextAction: null,
    };
    setWork((p) => [temp, ...p]);

    try {
      const res = await sendJSON<{ item: WorkItem }>("/api/work", "POST", {
        kind: workKind,
        title,
        status: workStatus,
        outcome: null,
        nextAction: null,
      });
      setWork((p) => [res.item, ...p.filter((x) => x.id !== temp.id)]);
      await sendJSON("/api/activity", "POST", {
        eventType: "WORK_CREATED",
        entityType: "work",
        entityId: res.item.id,
        note: `Created ${res.item.kind}: "${res.item.title}" -> ${res.item.status}`,
      });
      refreshAll();
    } catch (e: any) {
      setWork((p) => p.filter((x) => x.id !== temp.id));
      setError(e.message ?? "Failed to add work");
    }
  }

  async function moveWork(id: string, status: WorkStatus) {
    setError(null);
    const prev = work;
    setWork((cur) => cur.map((w) => (w.id === id ? { ...w, status } : w)));
    try {
      const res = await sendJSON<{ item: WorkItem }>("/api/work", "PATCH", { id, status });
      setWork((cur) => cur.map((w) => (w.id === id ? res.item : w)));

      await sendJSON("/api/activity", "POST", {
        eventType: status === "done" ? "WORK_MOVED_TO_DONE" : "WORK_STATUS_CHANGED",
        entityType: "work",
        entityId: id,
        note: `Moved "${res.item.title}" -> ${status}`,
      });

      refreshAll();
    } catch (e: any) {
      setWork(prev);
      setError(e.message ?? "Failed to move work");
    }
  }

  async function triageInbox() {
    setError(null);
    setTriaging(true);
    setSuggestions([]);
    try {
      const res = await sendJSON<{ items: TriageSuggestion[] }>("/api/ai/triage", "POST", {
        inboxItems: inbox.map((x) => ({ id: x.id, text: x.text })),
      });
      setSuggestions(res.items ?? []);
    } catch (e: any) {
      setError(e.message ?? "AI triage failed");
    } finally {
      setTriaging(false);
    }
  }

  async function applySuggestion(s: TriageSuggestion) {
    setError(null);

    try {
      // trash/reference/someday: just remove from inbox + log
      if (s.kind === "trash" || s.kind === "reference" || s.kind === "someday") {
        await sendJSON("/api/activity", "POST", {
          eventType: "INBOX_TRIAGE_APPLIED",
          entityType: "inbox",
          entityId: s.inbox_id,
          note: `Applied triage: ${s.kind}`,
        });
        await deleteInbox(s.inbox_id);
        setSuggestions((cur) => cur.filter((x) => x.inbox_id !== s.inbox_id));
        return;
      }

      // create work item
      const created = await sendJSON<{ item: WorkItem }>("/api/work", "POST", {
        kind: s.kind,
        title: s.title,
        status: s.status,
        outcome: null,
        nextAction: s.next_action ?? null,
      });

      await sendJSON("/api/activity", "POST", {
        eventType: "INBOX_TRIAGE_APPLIED",
        entityType: "inbox",
        entityId: s.inbox_id,
        note: `Created ${s.kind}: "${s.title}" -> ${s.status}${s.next_action ? ` (Next: ${s.next_action})` : ""}`,
      });

      await deleteInbox(s.inbox_id);
      setWork((p) => [created.item, ...p]);
      setSuggestions((cur) => cur.filter((x) => x.inbox_id !== s.inbox_id));
      refreshAll();
    } catch (e: any) {
      setError(e.message ?? "Apply failed");
    }
  }

  async function addSticky() {
    setError(null);
    try {
      const res = await sendJSON<{ note: WhiteboardNote }>("/api/whiteboard", "POST");
      setNotes((p) => [res.note, ...p]);
      await sendJSON("/api/activity", "POST", {
        eventType: "WHITEBOARD_NOTE_CREATED",
        entityType: "whiteboard",
        entityId: res.note.id,
        note: "Created sticky",
      });
      refreshAll();
    } catch (e: any) {
      setError(e.message ?? "Failed to add sticky");
    }
  }

  async function patchNote(id: string, patch: Partial<Pick<WhiteboardNote, "text" | "x" | "y" | "w" | "h">>) {
    setError(null);
    setNotes((cur) => cur.map((n) => (n.id === id ? ({ ...n, ...patch } as any) : n)));
    try {
      const res = await sendJSON<{ note: WhiteboardNote }>("/api/whiteboard", "PATCH", { id, ...patch });
      setNotes((cur) => cur.map((n) => (n.id === id ? res.note : n)));
      await sendJSON("/api/activity", "POST", {
        eventType: "WHITEBOARD_NOTE_UPDATED",
        entityType: "whiteboard",
        entityId: id,
        note: "Updated sticky",
      });
      refreshAll();
    } catch (e: any) {
      setError(e.message ?? "Failed to update sticky");
      refreshAll();
    }
  }

  async function deleteNote(id: string) {
    setError(null);
    const prev = notes;
    setNotes((cur) => cur.filter((n) => n.id !== id));
    try {
      await fetch(`/api/whiteboard?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      await sendJSON("/api/activity", "POST", {
        eventType: "WHITEBOARD_NOTE_DELETED",
        entityType: "whiteboard",
        entityId: id,
        note: "Deleted sticky",
      });
      refreshAll();
    } catch (e: any) {
      setNotes(prev);
      setError(e.message ?? "Failed to delete sticky");
    }
  }

  return (
    <div className="mx-auto max-w-[1280px] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-violet-600 to-emerald-500 shadow-sm" />
          <div>
            <div className="text-lg font-extrabold leading-none tracking-tight">Flowboard</div>
            <div className="mt-0.5 text-xs text-zinc-500">Capture - Triage - Do</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600 sm:inline">
            {inbox.length} inbox - {work.length} work
          </span>
          <button
            onClick={refreshAll}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium hover:bg-zinc-50"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="p-4 sm:p-5">
        {error ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[300px_1fr_340px]">
          {/* Inbox */}
          <section className="rounded-xl border border-zinc-200 bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="font-bold">Inbox</div>
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-500">
                {inbox.length}
              </span>
            </div>
            <div className="flex gap-2">
              <input
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                placeholder="Quick capture..."
                value={inboxText}
                onChange={(e) => setInboxText(e.target.value)}
                onKeyDown={(e) => (e.key === "Enter" ? addInbox() : null)}
              />
              <button onClick={addInbox} className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800">
                Add
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {inbox.length === 0 ? (
                <div className="rounded-lg border border-dashed border-zinc-200 p-4 text-center text-sm text-zinc-400">
                  Inbox zero. Capture something.
                </div>
              ) : (
                inbox.map((it) => (
                  <div
                    key={it.id}
                    className="group flex items-center justify-between gap-2 rounded-xl border border-zinc-200 px-3 py-2 text-sm hover:border-zinc-300"
                  >
                    <div className="min-w-0 flex-1 break-words">{it.text}</div>
                    <button
                      onClick={() => deleteInbox(it.id)}
                      className="rounded-lg border border-zinc-200 px-2 py-1 text-xs text-zinc-500 opacity-0 transition group-hover:opacity-100 hover:bg-zinc-50"
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Kanban */}
          <section className="rounded-xl border border-zinc-200 bg-white p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="font-bold">Work Kanban</div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
                  value={workKind}
                  onChange={(e) => setWorkKind(e.target.value as WorkKind)}
                >
                  <option value="task">Task</option>
                  <option value="project">Project</option>
                </select>
                <select
                  className="rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
                  value={workStatus}
                  onChange={(e) => setWorkStatus(e.target.value as WorkStatus)}
                >
                  {STATUS_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
                <input
                  className="w-44 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm outline-none focus:border-zinc-400"
                  placeholder="New work item..."
                  value={workTitle}
                  onChange={(e) => setWorkTitle(e.target.value)}
                  onKeyDown={(e) => (e.key === "Enter" ? addWork() : null)}
                />
                <button onClick={addWork} className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800">
                  Add
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
              {STATUS_ORDER.map((status) => (
                <div key={status} className="flex min-w-0 flex-col rounded-xl border border-zinc-200 bg-zinc-50/60 p-2">
                  <div className="mb-2 flex items-center justify-between">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ring-1 ${STATUS_CHIP[status]}`}>
                      {STATUS_LABEL[status]}
                    </span>
                    <span className="text-xs font-semibold text-zinc-400">{(workByStatus[status] ?? []).length}</span>
                  </div>
                  <div className="space-y-2">
                    {(workByStatus[status] ?? []).length === 0 ? (
                      <div className="rounded-lg border border-dashed border-zinc-200 py-3 text-center text-[11px] text-zinc-300">
                        empty
                      </div>
                    ) : (
                      (workByStatus[status] ?? []).map((w) => (
                        <div key={w.id} className="rounded-xl border border-zinc-200 bg-white p-2.5 shadow-sm">
                          <div className={`text-sm font-bold leading-snug ${status === "done" ? "text-zinc-400 line-through" : ""}`}>
                            {w.title}
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                                w.kind === "task" ? "bg-blue-50 text-blue-700" : "bg-orange-50 text-orange-700"
                              }`}
                            >
                              {w.kind}
                            </span>
                          </div>
                          {w.outcome ? <div className="mt-1.5 truncate text-[11px] text-zinc-500">{w.outcome}</div> : null}
                          {w.nextAction ? (
                            <div className="mt-1 text-[11px] text-zinc-600">
                              <span className="font-semibold">Next:</span> {w.nextAction}
                            </div>
                          ) : null}
                          <div className="mt-2">
                            <select
                              value={status}
                              onChange={(e) => moveWork(w.id, e.target.value as WorkStatus)}
                              className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] font-medium text-zinc-600 outline-none hover:bg-zinc-100"
                            >
                              {STATUS_ORDER.map((s) => (
                                <option key={s} value={s}>
                                  {s === status ? `In ${STATUS_LABEL[s]}` : `Move -> ${STATUS_LABEL[s]}`}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Right rail */}
          <section className="space-y-4">
            {/* AI triage */}
            <div className="rounded-xl border border-zinc-200 bg-white p-3">
              <div className="flex items-center justify-between">
                <div className="font-bold">AI Triage</div>
                <button
                  onClick={triageInbox}
                  disabled={triaging || inbox.length === 0}
                  className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
                >
                  {triaging ? "Triaging..." : "Triage Inbox"}
                </button>
              </div>

              <div className="mt-3 space-y-2">
                {suggestions.length === 0 ? (
                  <div className="text-sm text-zinc-500">
                    {inbox.length === 0 ? "Add inbox items to triage." : "Run triage to sort the inbox into work."}
                  </div>
                ) : (
                  suggestions.map((s) => (
                    <div key={s.inbox_id} className="rounded-xl border border-zinc-200 p-2.5">
                      <div className="text-sm font-bold leading-snug">{s.title}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-semibold text-zinc-600">{s.kind}</span>
                        <span className="text-zinc-500">-&gt; {STATUS_LABEL[s.status]}</span>
                        <span className="text-zinc-400">{Math.round(s.confidence * 100)}%</span>
                      </div>
                      {s.next_action ? <div className="mt-1 text-[11px] text-zinc-600">Next: {s.next_action}</div> : null}
                      <div className="mt-2 flex justify-end">
                        <button
                          onClick={() => applySuggestion(s)}
                          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800"
                        >
                          Apply
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Daily review */}
            <div className="rounded-xl border border-zinc-200 bg-white p-3">
              <div className="font-bold">Daily Review</div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-zinc-50 p-2">
                  <div className="text-2xl font-extrabold leading-none">{todayActivity.length}</div>
                  <div className="mt-1 text-[10px] font-semibold uppercase text-zinc-500">Events</div>
                </div>
                <div className="rounded-lg bg-zinc-50 p-2">
                  <div className="text-2xl font-extrabold leading-none text-emerald-600">
                    {todayActivity.filter((a) => a.eventType === "WORK_MOVED_TO_DONE").length}
                  </div>
                  <div className="mt-1 text-[10px] font-semibold uppercase text-zinc-500">Done</div>
                </div>
                <div className="rounded-lg bg-zinc-50 p-2">
                  <div className="text-2xl font-extrabold leading-none text-violet-600">
                    {todayActivity.filter((a) => a.eventType === "INBOX_TRIAGE_APPLIED").length}
                  </div>
                  <div className="mt-1 text-[10px] font-semibold uppercase text-zinc-500">Triaged</div>
                </div>
              </div>
              <div className="mt-2 rounded-lg border border-zinc-200 p-2 text-xs text-zinc-600">
                Next: {(workByStatus.next ?? []).length} &middot; Now: {(workByStatus.now ?? []).length} &middot; Waiting:{" "}
                {(workByStatus.waiting ?? []).length}
              </div>
            </div>

            {/* Activity feed */}
            <div className="rounded-xl border border-zinc-200 bg-white p-3">
              <div className="font-bold">Activity</div>
              <div className="mt-2 max-h-[300px] space-y-2 overflow-auto pr-1 text-sm">
                {activity.length === 0 ? (
                  <div className="text-sm text-zinc-500">No activity yet.</div>
                ) : (
                  activity.slice(0, 40).map((a) => (
                    <div key={a.id} className="rounded-lg border border-zinc-200 p-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">
                          {a.eventType.replace(/_/g, " ").toLowerCase()}
                        </div>
                        <div className="shrink-0 text-[10px] text-zinc-400">{timeAgo(a.createdAt)}</div>
                      </div>
                      <div className="mt-0.5 text-[13px] text-zinc-700">{a.note}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        </div>

        {/* Whiteboard */}
        <section className="mt-4 rounded-xl border border-zinc-200 bg-white p-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-bold">Whiteboard</div>
              <div className="text-xs text-zinc-500">Drag the stickies. Positions persist.</div>
            </div>
            <button onClick={addSticky} className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800">
              New Sticky
            </button>
          </div>

          <div
            ref={boardRef}
            className="relative mt-3 h-[300px] touch-none overflow-hidden rounded-xl border border-zinc-200"
            style={{
              backgroundColor: "#fafafa",
              backgroundImage: "radial-gradient(#d4d4d8 1px, transparent 1px)",
              backgroundSize: "18px 18px",
            }}
          >
            {notes.map((n, i) => (
              <Sticky
                key={n.id}
                note={n}
                color={STICKY_COLORS[i % STICKY_COLORS.length]}
                boardRef={boardRef}
                onPatch={(p) => patchNote(n.id, p)}
                onDelete={() => deleteNote(n.id)}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function Sticky({
  note,
  color,
  boardRef,
  onPatch,
  onDelete,
}: {
  note: WhiteboardNote;
  color: string;
  boardRef: React.RefObject<HTMLDivElement | null>;
  onPatch: (patch: Partial<Pick<WhiteboardNote, "text" | "x" | "y" | "w" | "h">>) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.text);

  const [local, setLocal] = useState({ x: note.x, y: note.y, w: note.w, h: note.h });
  useEffect(() => {
    setDraft(note.text);
    setLocal({ x: note.x, y: note.y, w: note.w, h: note.h });
  }, [note.id, note.text, note.x, note.y, note.w, note.h]);

  const dragRef = useRef<null | { startX: number; startY: number; origX: number; origY: number }>(null);

  function onPointerDown(e: React.PointerEvent) {
    if (editing) return;
    const target = e.target as HTMLElement;
    if (target.closest("button") || target.closest("textarea")) return;

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: local.x, origY: local.y };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;

    // Clamp to the real container size so notes can't leave the canvas.
    const rect = boardRef.current?.getBoundingClientRect();
    const maxX = rect ? Math.max(0, rect.width - local.w) : 980;
    const maxY = rect ? Math.max(0, rect.height - local.h) : 200;

    const x = clamp(dragRef.current.origX + dx, 0, maxX);
    const y = clamp(dragRef.current.origY + dy, 0, maxY);

    setLocal((p) => ({ ...p, x, y }));
  }

  function onPointerUp() {
    if (!dragRef.current) return;
    dragRef.current = null;
    onPatch({ x: local.x, y: local.y, w: local.w, h: local.h });
  }

  return (
    <div
      className={`absolute cursor-grab rounded-xl border border-black/10 p-2 shadow-lg active:cursor-grabbing ${color}`}
      style={{ left: local.x, top: local.y, width: local.w, height: local.h }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="mb-2 flex items-center justify-between">
        <button
          className="rounded-lg border border-black/20 bg-white/60 px-2 py-1 text-xs font-medium"
          onClick={() => {
            if (editing) {
              setEditing(false);
              onPatch({ text: draft });
            } else {
              setEditing(true);
            }
          }}
        >
          {editing ? "Done" : "Edit"}
        </button>
        <button className="rounded-lg border border-black/20 bg-white/80 px-2 py-1 text-xs" onClick={onDelete}>
          x
        </button>
      </div>

      {editing ? (
        <textarea
          className="h-[calc(100%-34px)] w-full resize-none rounded-lg border border-black/10 bg-white/70 p-2 text-sm outline-none"
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            setEditing(false);
            onPatch({ text: draft });
          }}
        />
      ) : (
        <div className="whitespace-pre-wrap text-sm leading-snug">{note.text}</div>
      )}
    </div>
  );
}

import React, { useEffect, useMemo, useRef, useState } from "react";
import * as htmlToImage from "html-to-image";
import {
  addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, isSameMonth, format, isSameDay, parseISO, differenceInCalendarDays
} from "date-fns";

interface EventItem {
  id: string;
  title: string;
  project: string;
  color: string;
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
}

const todayISO = () => format(new Date(), "yyyy-MM-dd");
const toISO = (d: Date) => format(d, "yyyy-MM-dd");

function loadEvents(): EventItem[] {
  try { return JSON.parse(localStorage.getItem("calendarpm.events") || "[]"); } catch { return []; }
}
function saveEvents(evts: EventItem[]) { localStorage.setItem("calendarpm.events", JSON.stringify(evts)); }
function inclusiveSpanDays(startISO: string, endISO: string) {
  return differenceInCalendarDays(parseISO(endISO), parseISO(startISO)) + 1;
}

// ========== Business-day helpers & constraints ==========
const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6; // Sun=0, Sat=6
const isMonday = (d: Date) => d.getDay() === 1;

function ensureWeekday(d: Date) {
  let x = new Date(d);
  while (isWeekend(x)) x = addDays(x, 1); // push forward to Monday if weekend
  return x;
}

function addBusinessDays(start: Date, n: number) {
  // add n business days (Mon–Fri); n=0 returns the same date
  let x = new Date(start);
  let added = 0;
  while (added < n) {
    x = addDays(x, 1);
    if (!isWeekend(x)) added++;
  }
  return x;
}
function subBusinessDays(start: Date, n: number) {
  let x = new Date(start);
  let left = n;
  while (left > 0) {
    x = addDays(x, -1);
    if (!isWeekend(x)) left--;
  }
  return x;
}
function nextBusinessDay(d: Date) {
  let x = addDays(d, 1);
  while (isWeekend(x)) x = addDays(x, 1);
  return x;
}
function prevBusinessDay(d: Date) {
  let x = addDays(d, -1);
  while (isWeekend(x)) x = addDays(x, -1);
  return x;
}

// Shoot day rule: day AFTER prepro end, but never weekend or Monday.
function nextValidShootDayAfter(d: Date) {
  let x = addDays(d, 1);
  while (isWeekend(x) || isMonday(x)) x = addDays(x, 1);
  return x;
}

// ========== Build "Commercial — 1-Day Shoot" from a kickoff date ==========
type BuiltEvent = {
  project: string; title: string; color: string; start: string; end: string;
};

function buildCommercialOneDayTemplate(projectName: string, kickoffISO: string, preproLen: number = 21) {
  const E = (title: string, color: string, start: Date, end: Date): BuiltEvent => ({
    project: projectName, title, color, start: format(start, "yyyy-MM-dd"), end: format(end, "yyyy-MM-dd")
  });

  // Colors (tweak anytime)
  const C = {
    kickoff: "#111827",       // near-black
    creative: "#7c3aed",      // purple
    prepro: "#2563eb",        // blue
    casting: "#f59e0b",       // amber
    lockLoc: "#06b6d4",       // cyan
    lockCast: "#ef4444",      // red
    lockWard: "#10b981",      // emerald
    ppm: "#374151",           // gray
    shoot: "#dc2626",         // red-600
    post: "#16a34a",          // green
    v1: "#0ea5e9",            // sky
    v2: "#6366f1",            // indigo
    v3: "#d946ef",            // fuchsia
    finish: "#0891b2",        // cyan-700 (Color/Sound/VFX)
    final: "#ef4444",
  };

  // 0) Kickoff (never on weekend)
  const kickoff = ensureWeekday(parseISO(kickoffISO));

  // 1) Creative — 14 business days starting at Kickoff
  const creativeStart = kickoff;
  const creativeEnd = addBusinessDays(creativeStart, 14 - 1);

  // 2) Pre-Production — default 21 business days (you said 20–23)
  //    Starts next business day after Creative
  const preproStart = nextBusinessDay(creativeEnd);
  const preproEnd = addBusinessDays(preproStart, preproLen - 1);

  // 3) Shoot Day — the day after prepro ends, but not weekend or Monday
  const shootDay = nextValidShootDayAfter(preproEnd);

  // 4) PPM — always 1 business day before Shoot Day
  const ppmDay = prevBusinessDay(shootDay);

  // 5) Locks (1-day milestones, on business days before shoot)
  const lockCastingDay = subBusinessDays(shootDay, 6);  // ~week before
  const lockWardrobeDay = subBusinessDays(shootDay, 3); // few days before
  const lockLocationDay = subBusinessDays(shootDay, 5); // around same week

  // 6) Casting — 14 business days during Prepro (overlaps)
  const castingStart = preproStart;
  const castingEnd = addBusinessDays(castingStart, 14 - 1);

  // 7) Post — 1 month (calendar) starting next business day after shoot
  const postStart = nextBusinessDay(shootDay);
  const postEnd = addDays(addMonths(shootDay, 1), -1); // one month window

  // 8) Deliveries — V1/V2/V3 on business days
  const v1 = addBusinessDays(shootDay, 7);
  const v2 = addBusinessDays(v1, 5);
  const v3 = addBusinessDays(v2, 4);

  // 9) Color / Sound / VFX — 5 business days, starts 2 business days BEFORE V3
  const finishStart = subBusinessDays(v3, 2);
  const finishEnd = addBusinessDays(finishStart, 5 - 1);

  // Build all events
  const events: BuiltEvent[] = [
    E("Project Kickoff", C.kickoff, kickoff, kickoff),
    E("Creative", C.creative, creativeStart, creativeEnd),
    E("Pre-Production", C.prepro, preproStart, preproEnd),
    E("Casting", C.casting, castingStart, castingEnd),
    E("Lock Casting", C.lockCast, lockCastingDay, lockCastingDay),
    E("Lock Location", C.lockLoc, lockLocationDay, lockLocationDay),
    E("Lock Wardrobe", C.lockWard, lockWardrobeDay, lockWardrobeDay),
    E("Final PPM", C.ppm, ppmDay, ppmDay),
    E("Shoot Day", C.shoot, shootDay, shootDay),
    E("Post Production", C.post, postStart, postEnd),
    E("V1 Edit Delivery", C.v1, v1, v1),
    E("V2 Edit Delivery", C.v2, v2, v2),
    E("V3 Edit Delivery", C.v3, v3, v3),
    E("Color / Sound / VFX", C.finish, finishStart, finishEnd),
    E("Final Delivery", C.final, postEnd, postEnd),
  ];

  return events;
}


export default function App() {
  const [currentMonth, setCurrentMonth] = useState<Date>(startOfMonth(new Date()));
  const [events, setEvents] = useState<EventItem[]>(() => loadEvents());
  useEffect(() => saveEvents(events), [events]);

// ===== Template controls =====
const [tplKickoff, setTplKickoff] = useState<string>(todayISO());
// was 21 with a 20–23 note
const [tplPreproDays, setTplPreproDays] = useState<number>(21); // supports 15–25

const [tplProject, setTplProject] = useState<string>("");

const [lastInsert, setLastInsert] = useState<string[] | null>(null);

function applyCommercialTemplate() {
  const name = tplProject.trim() || "Commercial Project";
  const built = buildCommercialOneDayTemplate(name, tplKickoff, tplPreproDays);

  // Map to your EventItem shape with IDs
  const toAdd = built.map((b) => ({
    id: crypto.randomUUID(),
    title: b.title,
    project: b.project,
    color: b.color,
    start: b.start,
    end: b.end,
  }));

  setEvents((prev) => [...prev, ...toAdd]);
  setLastInsert(toAdd.map((e) => e.id));
}

function undoLastInsert() {
  if (!lastInsert) return;
  setEvents((prev) => prev.filter((e) => !lastInsert.includes(e.id)));
  setLastInsert(null);
}


  const [draft, setDraft] = useState<EventItem>({
    id: "", title: "", project: "", color: "#2563eb", start: todayISO(), end: todayISO(),
  });

  const captureRef = useRef<HTMLDivElement>(null);

  const projects = useMemo(() => {
    const map = new Map<string, string>();
    events.forEach((e) => { if (!map.has(e.project)) map.set(e.project, e.color); });
    return Array.from(map.entries()).map(([name, color]) => ({ name, color }));
  }, [events]);

  function addEvent() {
    if (!draft.title.trim()) return;
    const id = crypto.randomUUID();
    const start = draft.start <= draft.end ? draft.start : draft.end;
    const end = draft.end >= draft.start ? draft.end : draft.start;
    setEvents((prev) => [...prev, { ...draft, id, start, end }]);
    setDraft((d) => ({ ...d, title: "" }));
  }
  function removeEvent(id: string) { setEvents((prev) => prev.filter((e) => e.id !== id)); }
  function clearAll() { if (confirm("Delete all events?")) setEvents([]); }
  function exportJSON() {
    const blob = new Blob([JSON.stringify(events, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = `calendarpm-events-${toISO(new Date())}.json`; a.click(); URL.revokeObjectURL(url);
  }
  function importJSON(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { try { setEvents(JSON.parse(String(reader.result))); } catch { alert("Invalid JSON file"); } };
    reader.readAsText(file);
  }
  async function downloadJpeg() {
    const node = captureRef.current; if (!node) return;
    // @ts-ignore
    if (document.fonts?.ready) await (document.fonts as any).ready;
    const dataUrl = await htmlToImage.toJpeg(node, { quality: 0.95, pixelRatio: 2, backgroundColor: "#ffffff", cacheBust: true });
    const link = document.createElement("a");
    link.download = `Calendar-${format(currentMonth, "yyyy-MM")}.jpg`;
    link.href = dataUrl; link.click();
  }

type EditDraft = {
  id: string;
  title: string;
  project: string;
  color: string;
  start: string; // yyyy-mm-dd
  end: string;   // yyyy-mm-dd
} | null;

const [edit, setEdit] = useState<EditDraft>(null);

function handleBarClick(id: string) {
  const e = events.find(ev => ev.id === id);
  if (!e) return;
  setEdit({ ...e }); // open modal with this event
}

function saveEdit() {
  if (!edit) return;
  // ensure start <= end
  const start = edit.start <= edit.end ? edit.start : edit.end;
  const end   = edit.end   >= edit.start ? edit.end   : edit.start;

  setEvents(prev => prev.map(ev => ev.id === edit.id ? { ...edit, start, end } : ev));
  setEdit(null);
}

function deleteEdit() {
  if (!edit) return;
  setEvents(prev => prev.filter(ev => ev.id !== edit.id));
  setEdit(null);
}


  return (
    <div className="min-h-screen font-sans bg-neutral-50 text-neutral-900 p-4 md:p-6">
      {/* Toolbar */}
      <div className="print:hidden flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex items-center gap-3">
          <button className="px-3 py-2 rounded-xl bg-white shadow" onClick={() => setCurrentMonth((m) => subMonths(m, 1))}>◀ Prev</button>
          <div className="text-2xl md:text-3xl font-semibold">{format(currentMonth, "MMMM yyyy")}</div>
          <button className="px-3 py-2 rounded-xl bg-white shadow" onClick={() => setCurrentMonth((m) => addMonths(m, 1))}>Next ▶</button>
          <button className="px-3 py-2 rounded-xl bg-white shadow" onClick={() => setCurrentMonth(startOfMonth(new Date()))}>Today</button>
        </div>
        <div className="flex items-center gap-2">
          <button className="px-3 py-2 rounded-xl bg-white shadow" onClick={() => window.print()}>Print / Save PDF</button>
          <button className="px-3 py-2 rounded-xl bg-white shadow" onClick={downloadJpeg}>Download JPG</button>
          <button className="px-3 py-2 rounded-xl bg-white shadow" onClick={exportJSON}>Export JSON</button>
          <label className="px-3 py-2 rounded-xl bg-white shadow cursor-pointer">Import JSON
            <input type="file" accept="application/json" className="hidden" onChange={importJSON} />
          </label>
          <button className="px-3 py-2 rounded-xl bg-white shadow" onClick={clearAll}>Clear All</button>
        </div>
      </div>

      {/* Legend */}
      <div className="print:hidden mt-4 flex flex-wrap gap-3">
        {projects.length > 0 ? projects.map((p) => (
          <div key={p.name} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white shadow">
            <span className="inline-block w-3 h-3 rounded-full" style={{ background: p.color }} />
            <span className="text-sm font-medium">{p.name}</span>
          </div>
        )) : <div className="text-sm text-neutral-500">Add a project below to see a legend.</div>}
      </div>

      {/* EXPORTABLE AREA */}
      <div ref={captureRef} className="mt-4 bg-white rounded-2xl shadow">
        {/* Month title inside the image */}
        <div className="px-4 pt-4 pb-2">
          <div className="text-2xl md:text-3xl font-semibold">{format(currentMonth, "MMMM yyyy")}</div>
        </div>
        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-t border-b text-xs uppercase tracking-wide text-neutral-500">
          {"Sun,Mon,Tue,Wed,Thu,Fri,Sat".split(",").map((d) => (
            <div key={d} className="px-3 py-2 text-center md:text-left md:px-4">{d}</div>
          ))}
        </div>
        {/* Days with spanning bars */}
        <MonthCells month={currentMonth} events={events} onBarClick={handleBarClick} />
      </div>

{/* Template: Commercial — 1-Day Shoot */}
<div className="print:hidden mt-6 bg-white rounded-2xl shadow p-4 md:p-6">
  <div className="text-lg font-semibold mb-3">Template — 1-Day Shoot Commercial</div>
  <div className="grid md:grid-cols-6 gap-3">
    <label className="col-span-2 text-sm">
      <div className="text-neutral-500 mb-1">Kickoff date (no weekends)</div>
      <input
        type="date"
        className="w-full px-3 py-2 rounded-xl border"
        value={tplKickoff}
        onChange={(e) => setTplKickoff(e.target.value)}
      />
    </label>

    <label className="col-span-2 text-sm">
      <div className="text-neutral-500 mb-1">Pre-Production length (business days)</div>
      <select
  className="w-full px-3 py-2 rounded-xl border"
  value={tplPreproDays}
  onChange={(e) => setTplPreproDays(parseInt(e.target.value, 10))}
>
  {Array.from({ length: 11 }, (_, i) => 15 + i).map((n) => (
    <option key={n} value={n}>{n} days</option>
  ))}
</select>

    </label>

    <label className="col-span-2 text-sm">
      <div className="text-neutral-500 mb-1">Project name</div>
      <input
        className="w-full px-3 py-2 rounded-xl border"
        placeholder="e.g., Varo Fall TVC"
        value={tplProject}
        onChange={(e) => setTplProject(e.target.value)}
      />
    </label>

    <div className="col-span-6 flex items-center gap-3">
      <button
        className="px-4 py-2 rounded-xl bg-neutral-900 text-white hover:bg-black"
        onClick={applyCommercialTemplate}
      >
        Apply Template
      </button>
      <button
        disabled={!lastInsert}
        className={
          "px-3 py-2 rounded-xl " +
          (lastInsert ? "bg-neutral-100 hover:bg-neutral-200" : "bg-neutral-50 text-neutral-400")
        }
        onClick={undoLastInsert}
        title={lastInsert ? "Remove events added by the last template" : "Nothing to undo yet"}
      >
        Undo Last Insert
      </button>
      <span className="text-xs text-neutral-500">
        Shoot day auto-avoids weekends & Mondays; PPM is the business day before.
      </span>
    </div>
  </div>
</div>


      {/* Add Event */}
      <div className="print:hidden mt-6 bg-white rounded-2xl shadow p-4 md:p-6">
        <div className="text-lg font-semibold mb-3">Add Project Timeline</div>
        <div className="grid md:grid-cols-6 gap-3">
          <input className="col-span-2 px-3 py-2 rounded-xl border" placeholder="Project" value={draft.project}
            onChange={(e) => setDraft((d) => ({ ...d, project: e.target.value }))} />
          <input className="col-span-2 px-3 py-2 rounded-xl border" placeholder="Title" value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
          <input type="color" className="col-span-1 h-10 w-full rounded-xl border" value={draft.color}
            onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value }))} />
          <div className="col-span-1 flex items-center gap-2">
            <span className="text-sm text-neutral-500">{inclusiveSpanDays(draft.start, draft.end)}d</span>
          </div>
          <div className="col-span-3 flex gap-3">
            <label className="flex-1 flex items-center gap-2"><span className="text-sm text-neutral-500 w-9">Start</span>
              <input type="date" className="flex-1 px-3 py-2 rounded-xl border" value={draft.start}
                onChange={(e) => setDraft((d) => ({ ...d, start: e.target.value }))} />
            </label>
            <label className="flex-1 flex items-center gap-2"><span className="text-sm text-neutral-500 w-9">End</span>
              <input type="date" className="flex-1 px-3 py-2 rounded-xl border" value={draft.end}
                onChange={(e) => setDraft((d) => ({ ...d, end: e.target.value }))} />
            </label>
          </div>
          <div className="col-span-3 flex items-center gap-3">
            <button className="px-4 py-2 rounded-xl bg-neutral-900 text-white" onClick={addEvent}>Add Timeline</button>
            <span className="text-xs text-neutral-500">Tip: add multiple segments (Prep, Shoot, Post, Delivery)</span>
          </div>
        </div>

        {/* Add Event */}
<div className="print:hidden mt-6 bg-white rounded-2xl shadow p-4 md:p-6">
  {/* ...add event form... */}
</div>

{/* ⬇️⬇️ PASTE MODAL HERE (still inside App's return) ⬇️⬇️ */}
{edit && (
  <div className="fixed inset-0 z-50 flex items-center justify-center">
    <div className="absolute inset-0 bg-black/40" onClick={() => setEdit(null)} />
    <div className="relative w-full max-w-lg mx-4 rounded-2xl bg-white shadow-xl p-5 md:p-6">
      <div className="text-lg font-semibold mb-4">Edit Timeline</div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-sm">
          <div className="text-neutral-500 mb-1">Project</div>
          <input
            className="w-full px-3 py-2 rounded-xl border"
            value={edit.project}
            onChange={(e) => setEdit(prev => prev && { ...prev, project: e.target.value })}
          />
        </label>

        <label className="text-sm">
          <div className="text-neutral-500 mb-1">Title</div>
          <input
            className="w-full px-3 py-2 rounded-xl border"
            value={edit.title}
            onChange={(e) => setEdit(prev => prev && { ...prev, title: e.target.value })}
          />
        </label>

        <label className="text-sm">
          <div className="text-neutral-500 mb-1">Color</div>
          <input
            type="color"
            className="w-full h-10 rounded-xl border"
            value={edit.color}
            onChange={(e) => setEdit(prev => prev && { ...prev, color: e.target.value })}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            <div className="text-neutral-500 mb-1">Start</div>
            <input
              type="date"
              className="w-full px-3 py-2 rounded-xl border"
              value={edit.start}
              onChange={(e) => setEdit(prev => prev && { ...prev, start: e.target.value })}
            />
          </label>
          <label className="text-sm">
            <div className="text-neutral-500 mb-1">End</div>
            <input
              type="date"
              className="w-full px-3 py-2 rounded-xl border"
              value={edit.end}
              onChange={(e) => setEdit(prev => prev && { ...prev, end: e.target.value })}
            />
          </label>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          className="px-2.5 py-1 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-sm"
          onClick={() => setEdit(prev => prev && {
            ...prev,
            start: format(addDays(parseISO(prev.start), -1), 'yyyy-MM-dd'),
            end:   format(addDays(parseISO(prev.end), -1),   'yyyy-MM-dd'),
          })}
        >
          Shift −1d
        </button>
        <button
          className="px-2.5 py-1 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-sm"
          onClick={() => setEdit(prev => prev && {
            ...prev,
            start: format(addDays(parseISO(prev.start), 1), 'yyyy-MM-dd'),
            end:   format(addDays(parseISO(prev.end), 1),   'yyyy-MM-dd'),
          })}
        >
          Shift +1d
        </button>
      </div>

      <div className="mt-5 flex items-center justify-between">
        <button className="px-3 py-2 rounded-xl bg-neutral-100 hover:bg-neutral-200" onClick={() => setEdit(null)}>
          Cancel
        </button>
        <div className="flex items-center gap-2">
          <button className="px-3 py-2 rounded-xl bg-red-100 text-red-700 hover:bg-red-200" onClick={deleteEdit}>
            Delete
          </button>
          <button className="px-3 py-2 rounded-xl bg-neutral-900 text-white hover:bg-black" onClick={saveEdit}>
            Save
          </button>
        </div>
      </div>
    </div>
  </div>
)}
{/* ⬆️⬆️ END MODAL ⬆️⬆️ */}


        {events.length > 0 && (
          <div className="mt-6">
            <div className="text-sm font-medium mb-2">All Timelines</div>
            <div className="max-h-48 overflow-auto border rounded-xl divide-y">
              {events.map((e) => (
                <div key={e.id} className="flex items-center justify-between px-3 py-2">
                  <div className="flex items-center gap-3">
                    <span className="inline-block w-3 h-3 rounded-full" style={{ background: e.color }} />
                    <div className="text-sm">
                      <span className="font-medium">{e.project}</span> — {e.title}
                      <span className="text-neutral-500"> ({e.start} → {e.end})</span>
                    </div>
                  </div>
                  <button className="text-xs px-2 py-1 rounded-lg bg-neutral-100 hover:bg-neutral-200" onClick={() => removeEvent(e.id)}>
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MonthCells({
  month,
  events,
  onBarClick, // ⬅️ add this
}: {
  month: Date;
  events: EventItem[];
  onBarClick: (id: string) => void; // ⬅️ add this
}) {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const weeks: Date[][] = [];
  for (let wStart = gridStart; wStart <= gridEnd; wStart = addDays(wStart, 7)) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) week.push(addDays(wStart, i));
    weeks.push(week);
  }

  return (
    <div className="divide-y divide-neutral-200">
      {weeks.map((week, wi) => {
        const weekStart = week[0];
        const weekEnd = week[6];
        const { segments, laneCount } = layoutWeekSegments(events, weekStart, weekEnd);

        return (
          <div key={wi} className="relative">
            <div className="grid grid-cols-7">
              {week.map((day, di) => (
                <div key={di}
                  className={"min-h-[160px] md:min-h-[180px] border border-neutral-200 p-2 md:p-3 relative " +
                    (isSameMonth(day, month) ? "bg-white" : "bg-neutral-50")}>
                  <div className="relative z-10 flex items-center justify-between">
                    <div className={"text-xs md:text-sm font-medium " + (isSameMonth(day, month) ? "text-neutral-900" : "text-neutral-400")}>
                      {format(day, "d")}
                    </div>
                    {isSameDay(day, new Date()) && (
                      <span className="text-[10px] md:text-xs px-2 py-0.5 rounded-full bg-neutral-900 text-white">Today</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="pointer-events-none absolute inset-x-0 bottom-0 top-9 px-1 z-0">
              {Array.from({ length: laneCount }).map((_, lane) => (
                <div key={lane} className="grid grid-cols-7 gap-1 mb-1">
                  {segments.filter((s) => s.lane === lane).map((s) => (
                    <div key={s.id + String(s.segStart)}
                      onClick={() => onBarClick(s.id)}
                      style={{ gridColumn: `${s.colStart} / ${s.colEnd}`, background: s.color }}
                      className="pointer-events-auto cursor-pointer font-bar uppercase font-bold tracking-wide
                      h-9 md:h-9 text-white text-[15px] md:text-[16px] leading-[1] px-2.5 py-0 overflow-hidden whitespace-nowrap flex items-center rounded-full"
                      title={`${s.project} · ${s.title}`}>
                      <span className="font-extrabold">{s.title}</span>

                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function layoutWeekSegments(events: EventItem[], weekStart: Date, weekEnd: Date) {
  type Seg = {
    id: string; title: string; project: string; color: string;
    segStart: Date; segEnd: Date; colStart: number; colEnd: number; lane: number;
  };

  const segs: Seg[] = [];
  for (const e of events) {
    const s = parseISO(e.start); const t = parseISO(e.end);
    if (t < weekStart || s > weekEnd) continue;
    const segStart = s < weekStart ? weekStart : s;
    const segEnd = t > weekEnd ? weekEnd : t;
    const colStart = differenceInCalendarDays(segStart, weekStart) + 1;
    const colEnd = differenceInCalendarDays(segEnd, weekStart) + 2;
    segs.push({ id: e.id, title: e.title, project: e.project, color: e.color, segStart, segEnd, colStart, colEnd, lane: 0 });
  }

  segs.sort((a, b) => (a.segStart.getTime() - b.segStart.getTime()) || (a.segEnd.getTime() - b.segEnd.getTime()));

  const laneEnds: Date[] = [];
  for (const seg of segs) {
    let lane = 0;
    while (lane < laneEnds.length && seg.segStart <= laneEnds[lane]) lane++;
    seg.lane = lane;
    laneEnds[lane] = seg.segEnd;
  }
  return { segments: segs, laneCount: laneEnds.length };
}

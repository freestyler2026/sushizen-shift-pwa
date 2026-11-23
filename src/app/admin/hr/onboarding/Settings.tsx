"use client";

/**
 * Onboarding settings: the checklist every new hire gets, and the follow-up
 * procedure. HR keeps both here, without asking for a code change (owner,
 * 2026-11-23). The legal documents, the uniform count and the deduction
 * authorization are locked: other rules depend on them, so only their names
 * change.
 */

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";
import type { FuMilestone, FuTemplate } from "@/lib/onboarding-followup";
import { SMALL_BUTTON, T_CAPTION, T_LABEL, TAB_ACTIVE, TAB_CONTAINER, TAB_INACTIVE } from "@/lib/ui-tokens";

const FIELD = "w-full rounded-lg border border-white/10 bg-white/6 px-2.5 py-1.5 text-xs text-white placeholder:text-zinc-500 outline-none focus:border-violet-500/50";

type Tpl = { item_key: string; label: string; category: string; city: string; active: boolean; locked: boolean; sort_order: number; updated_by: string };

function ItemRow({ t, categories, onSaved }: { t: Tpl; categories: string[]; onSaved: (rows: Tpl[]) => void }) {
  const [d, setD] = useState(t);
  const [msg, setMsg] = useState("");
  const dirty = d.label !== t.label || d.category !== t.category || d.city !== t.city || d.active !== t.active;
  async function save() {
    setMsg("");
    try {
      const out = await apiPost<{ templates: Tpl[] }>("/api/admin/hr/onboarding/settings/items", d);
      onSaved(out.templates);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    }
  }
  return (
    <li className="grid grid-cols-[1fr_auto] gap-2 rounded-lg border border-white/10 bg-white/5 p-2">
      <div className="grid grid-cols-1 gap-1 sm:grid-cols-[2fr_1fr_1fr]">
        <input className={FIELD} aria-label={`${t.item_key} name`} value={d.label} onChange={(e) => setD({ ...d, label: e.target.value })} />
        <select className={FIELD} aria-label={`${t.item_key} category`} disabled={t.locked} value={d.category} onChange={(e) => setD({ ...d, category: e.target.value })}>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className={FIELD} aria-label={`${t.item_key} city`} disabled={t.locked} value={d.city} onChange={(e) => setD({ ...d, city: e.target.value })}>
          <option value="all">All cities</option><option value="manila">Manila</option><option value="dubai">Dubai</option>
        </select>
        {msg && <p className="text-xs text-red-400 sm:col-span-3">{msg}</p>}
      </div>
      <div className="flex flex-col items-end gap-1">
        {t.locked ? <span className="text-[10px] text-zinc-500">Locked</span> : (
          <label className="flex items-center gap-1 text-xs text-zinc-300">
            <input type="checkbox" checked={d.active} onChange={(e) => setD({ ...d, active: e.target.checked })} /> In use
          </label>
        )}
        <button className={SMALL_BUTTON} disabled={!dirty} onClick={() => void save()}>Save</button>
      </div>
    </li>
  );
}

function ChecklistTab() {
  const [rows, setRows] = useState<Tpl[]>([]);
  const [cats, setCats] = useState<string[]>([]);
  const [n, setN] = useState({ label: "", category: "orientation", city: "all", add: true });
  const [msg, setMsg] = useState("");
  const load = useCallback(async () => {
    const d = await apiGet<{ items: Tpl[]; categories: string[] }>("/api/admin/hr/onboarding/settings/items");
    setRows(d.items);
    setCats(d.categories);
  }, []);
  useEffect(() => { void load().catch((e) => setMsg(String(e?.message || e))); }, [load]);
  async function add() {
    setMsg("");
    try {
      const out = await apiPost<{ templates: Tpl[]; added_to_in_progress: number }>("/api/admin/hr/onboarding/settings/items",
        { label: n.label, category: n.category, city: n.city, add_to_in_progress: n.add });
      setRows(out.templates);
      setN({ ...n, label: "" });
      setMsg(`Added. ${out.added_to_in_progress} new hire${out.added_to_in_progress === 1 ? "" : "s"} in progress also got it.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    }
  }
  return (
    <div className="space-y-3">
      <p className={T_CAPTION}>Every new hire gets the items in use for their city. Turning one off stops it for new hires; records already open keep it.</p>
      <ul className="space-y-1.5">
        {rows.map((t) => <ItemRow key={t.item_key + t.label + t.active} t={t} categories={cats} onSaved={setRows} />)}
      </ul>
      <div className="space-y-1.5 rounded-lg border border-violet-500/20 bg-violet-500/5 p-2">
        <p className={T_LABEL}>Add an item</p>
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-[2fr_1fr_1fr]">
          <input className={FIELD} aria-label="New item name" placeholder="e.g. Locker assigned" value={n.label} onChange={(e) => setN({ ...n, label: e.target.value })} />
          <select className={FIELD} aria-label="New item category" value={n.category} onChange={(e) => setN({ ...n, category: e.target.value })}>
            {cats.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className={FIELD} aria-label="New item city" value={n.city} onChange={(e) => setN({ ...n, city: e.target.value })}>
            <option value="all">All cities</option><option value="manila">Manila</option><option value="dubai">Dubai</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-xs text-zinc-300">
          <input type="checkbox" checked={n.add} onChange={(e) => setN({ ...n, add: e.target.checked })} /> Also add to new hires still in progress
        </label>
        <button className={SMALL_BUTTON} disabled={!n.label.trim()} onClick={() => void add()}>Add item</button>
      </div>
      {msg && <p className="text-xs text-zinc-300">{msg}</p>}
    </div>
  );
}

const lines = (v: string) => v.split("\n").map((s) => s.trim()).filter(Boolean);

function FollowUpTab() {
  const [city, setCity] = useState("manila");
  const [t, setT] = useState<FuTemplate | null>(null);
  const [meta, setMeta] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setMsg("");
    const d = await apiGet<{ current: { version: number; template: FuTemplate; saved_by: string; saved_at: string } | null; default: FuTemplate }>(
      `/api/admin/hr/onboarding/settings/followup?city=${city}`);
    setT(d.current?.template || null);
    setMeta(d.current ? `Version ${d.current.version}, saved by ${d.current.saved_by}` : "No procedure for this city yet.");
    if (!d.current) setT({ ...d.default, effective_from: "" });
  }, [city]);
  useEffect(() => { void load().catch((e) => setMsg(String(e?.message || e))); }, [load]);

  if (!t) return <p className={T_CAPTION}>{msg || "Loading…"}</p>;
  const upd = (patch: Partial<FuTemplate>) => setT({ ...t, ...patch });
  const setMs = (i: number, patch: Partial<FuMilestone>) => upd({ milestones: t.milestones.map((m, j) => (j === i ? { ...m, ...patch } : m)) });

  async function save() {
    setMsg("");
    try {
      const res = await fetch("/api/admin/hr/onboarding/settings/followup", {
        method: "PUT", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ city, template: t }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.detail || `HTTP ${res.status}`);
      setMsg(`Saved as version ${d.current.version}. New hires from now use it; follow-ups already running keep theirs.`);
      setMeta(`Version ${d.current.version}, saved by ${d.current.saved_by}`);
      setT(d.current.template);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <div className="space-y-3" data-testid="followup-settings">
      <div className="flex items-center gap-2">
        <select className={FIELD} aria-label="Procedure city" value={city} onChange={(e) => setCity(e.target.value)}>
          <option value="manila">Manila</option><option value="dubai">Dubai</option>
        </select>
        <span className={T_CAPTION}>{meta}</span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="space-y-1"><span className={T_LABEL}>Title</span>
          <input className={FIELD} aria-label="Procedure title" value={t.title} onChange={(e) => upd({ title: e.target.value })} /></label>
        <label className="space-y-1"><span className={T_LABEL}>Starts by itself for hires from</span>
          <input type="date" className={FIELD} aria-label="Effective from" value={t.effective_from || ""} onChange={(e) => upd({ effective_from: e.target.value })} /></label>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between"><span className={T_LABEL}>Check-ins</span>
          <button className="text-xs text-violet-300" onClick={() => upd({ milestones: [...t.milestones, { label: "", offset_days: 0, focus: "" }] })}>+ Add check-in</button></div>
        {t.milestones.map((m, i) => (
          <div key={i} className="grid grid-cols-2 gap-1 rounded border border-white/10 p-1.5 sm:grid-cols-[1.2fr_0.8fr_0.6fr_0.6fr_0.8fr_auto]">
            <input className={FIELD} aria-label={`Check-in ${i + 1} name`} placeholder="Name" value={m.label} onChange={(e) => setMs(i, { label: e.target.value })} />
            <select className={FIELD} aria-label={`Check-in ${i + 1} timing`} value={m.offset_months ? "months" : "days"}
              onChange={(e) => setMs(i, e.target.value === "months" ? { offset_months: 1, offset_days: undefined } : { offset_days: 0, offset_months: undefined })}>
              <option value="days">Days after start</option><option value="months">Months after start</option>
            </select>
            <input className={FIELD} type="number" min={0} aria-label={`Check-in ${i + 1} amount`} value={m.offset_months ?? m.offset_days ?? 0}
              onChange={(e) => setMs(i, m.offset_months ? { offset_months: Number(e.target.value) } : { offset_days: Number(e.target.value) })} />
            <input className={FIELD} type="number" min={0} aria-label={`Check-in ${i + 1} grace days`} title="Days of grace before it counts as late" value={m.late_after_days ?? 0}
              onChange={(e) => setMs(i, { late_after_days: Number(e.target.value) })} />
            <select className={FIELD} aria-label={`Check-in ${i + 1} method`} value={m.suggested_method || ""} onChange={(e) => setMs(i, { suggested_method: e.target.value })}>
              <option value="">Any method</option>
              {t.methods.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
            </select>
            <button className="text-xs text-red-300" aria-label={`Remove check-in ${i + 1}`} onClick={() => upd({ milestones: t.milestones.filter((_, j) => j !== i) })}>Remove</button>
            <input className={`${FIELD} col-span-2 sm:col-span-6`} aria-label={`Check-in ${i + 1} focus`} placeholder="Focus" value={m.focus || ""} onChange={(e) => setMs(i, { focus: e.target.value })} />
          </div>
        ))}
        <p className={T_CAPTION}>Day 1 is the start date (0 days). &ldquo;1 month&rdquo; is the same date next month, or its last day. Grace: days before it counts as late (Day 7 or 8 = 6 days + 1).</p>
      </div>

      <div className="space-y-1">
        <span className={T_LABEL}>Contact methods</span>
        {t.methods.map((m, i) => (
          <div key={i} className="grid grid-cols-[3rem_1fr_auto] items-center gap-1">
            <input className={FIELD} aria-label={`Method ${i + 1} code`} value={m.key} onChange={(e) => upd({ methods: t.methods.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)) })} />
            <input className={FIELD} aria-label={`Method ${i + 1} name`} value={m.label} onChange={(e) => upd({ methods: t.methods.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
            <label className="flex items-center gap-1 text-xs text-zinc-300"><input type="checkbox" checked={m.counts}
              onChange={(e) => upd({ methods: t.methods.map((x, j) => (j === i ? { ...x, counts: e.target.checked } : x)) })} /> Counts</label>
          </div>
        ))}
      </div>

      <label className="block space-y-1"><span className={T_LABEL}>Questions for each check-in (one per line)</span>
        <textarea className={FIELD} rows={4} aria-label="Check-in questions" value={t.questions.map((q) => q.label).join("\n")}
          onChange={(e) => upd({ questions: lines(e.target.value).map((label, i) => ({ key: t.questions[i]?.key, label })) })} /></label>

      <label className="block space-y-1"><span className={T_LABEL}>Ratings (one per line: Name: option, option, …)</span>
        <textarea className={FIELD} rows={2} aria-label="Ratings" value={t.ratings.map((r) => `${r.label}: ${r.options.join(", ")}`).join("\n")}
          onChange={(e) => upd({ ratings: lines(e.target.value).map((l, i) => {
            const [label, opts = ""] = l.split(":");
            return { key: t.ratings[i]?.key, label: label.trim(), options: opts.split(",").map((o) => o.trim()).filter(Boolean) };
          }) })} /></label>

      {t.pic && (
        <div className="space-y-1">
          <span className={T_LABEL}>PIC consultation</span>
          <div className="grid grid-cols-[1fr_6rem] gap-1">
            <input className={FIELD} aria-label="PIC label" value={t.pic.label} onChange={(e) => upd({ pic: { ...t.pic!, label: e.target.value } })} />
            <input className={FIELD} type="number" min={0} aria-label="PIC due days" title="Days after start" value={t.pic.due_offset_days}
              onChange={(e) => upd({ pic: { ...t.pic!, due_offset_days: Number(e.target.value) } })} />
          </div>
          <input className={FIELD} aria-label="Competency areas" placeholder="Competency areas, comma-separated" value={t.pic.competency_areas.join(", ")}
            onChange={(e) => upd({ pic: { ...t.pic!, competency_areas: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } })} />
          <textarea className={FIELD} rows={3} aria-label="PIC questions" value={t.pic.questions.map((q) => q.label).join("\n")}
            onChange={(e) => upd({ pic: { ...t.pic!, questions: lines(e.target.value).map((label, i) => ({ key: t.pic!.questions[i]?.key, label })) } })} />
        </div>
      )}

      <div className="grid grid-cols-3 gap-1">
        {([["phone", "Phone calls (min)"], ["face_to_face", "Face-to-face (min)"], ["pic", "PIC consultations (min)"]] as const).map(([k, label]) => (
          <label key={k} className="space-y-1"><span className={T_LABEL}>{label}</span>
            <input className={FIELD} type="number" min={0} aria-label={label} value={t.minimums[k]}
              onChange={(e) => upd({ minimums: { ...t.minimums, [k]: Number(e.target.value) } })} /></label>
        ))}
      </div>

      <label className="block space-y-1"><span className={T_LABEL}>Rules shown with every follow-up (one per line)</span>
        <textarea className={FIELD} rows={3} aria-label="Rules" value={t.rules.join("\n")} onChange={(e) => upd({ rules: lines(e.target.value) })} /></label>

      <button className={SMALL_BUTTON} onClick={() => void save()}>Save procedure</button>
      {msg && <p className="text-xs text-zinc-300">{msg}</p>}
    </div>
  );
}

export default function OnboardingSettings({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"checklist" | "followup">("checklist");
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose}>
      <div className="h-full w-full max-w-2xl overflow-y-auto border-l border-white/10 bg-zinc-950 p-5" onClick={(e) => e.stopPropagation()} data-testid="onboarding-settings">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Onboarding settings</h2>
          <button className="text-sm text-zinc-400 hover:text-white" onClick={onClose}>Close</button>
        </div>
        <p className={`${T_CAPTION} mb-3`}>HR keeps these. Changes apply to new hires from now on; nothing needs to be requested from IT.</p>
        <div className={`${TAB_CONTAINER} mb-4`}>
          <button className={tab === "checklist" ? TAB_ACTIVE : TAB_INACTIVE} onClick={() => setTab("checklist")}>Checklist items</button>
          <button className={tab === "followup" ? TAB_ACTIVE : TAB_INACTIVE} onClick={() => setTab("followup")}>Follow-up procedure</button>
        </div>
        {tab === "checklist" ? <ChecklistTab /> : <FollowUpTab />}
      </div>
    </div>
  );
}

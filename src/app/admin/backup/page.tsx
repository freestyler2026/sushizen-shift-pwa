// src/app/admin/backup/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import { BRANCHES, type BranchCode, type City } from "@/lib/branches";
import {
  BADGE_INFO,
  BADGE_WARNING,
  GLASS_CARD,
  INPUT_CLASS,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SELECT_CLASS,
  SMALL_BUTTON,
  T_CAPTION,
  T_CARD_TITLE,
  T_LABEL,
  T_PAGE_TITLE,
  TABLE_CELL,
  TABLE_HEADER,
  TABLE_ROW,
} from "@/lib/ui-tokens";

// ─── Fixed Template Definition ───────────────────────────────────────────────

type TemplateItem = {
  key: string;
  label: string;
  unit: string;
  section: string;
  item_type: "ingredient" | "menu_item";
  item_category: string;
};

type TemplateSection = {
  id: string;
  label: string;
  labelJa: string;
  items: TemplateItem[];
};

const TEMPLATE_SECTIONS: TemplateSection[] = [
  {
    id: "supplies",
    label: "Condiments & Supplies",
    labelJa: "調味料・備品",
    items: [
      { key: "ginger",     label: "Ginger",     unit: "pcs", section: "supplies", item_type: "ingredient", item_category: "野菜" },
      { key: "wasabi",     label: "Wasabi",     unit: "pcs", section: "supplies", item_type: "ingredient", item_category: "調味料" },
      { key: "soy_sauce",  label: "Soy Sauce",  unit: "pcs", section: "supplies", item_type: "ingredient", item_category: "調味料" },
      { key: "sweet_sauce",label: "Sweet Sauce",unit: "pcs", section: "supplies", item_type: "menu_item",  item_category: "Original Sushi Sauce" },
      { key: "miso_soup",  label: "Miso Soup",  unit: "pcs", section: "supplies", item_type: "menu_item",  item_category: "Hot Menu原価" },
      { key: "ice_pack",   label: "Ice Pack",   unit: "pcs", section: "supplies", item_type: "ingredient", item_category: "包材" },
    ],
  },
  {
    id: "packaging",
    label: "Packaging",
    labelJa: "包材・ボックス",
    items: [
      { key: "box_12",      label: "NEW BOX 12",        unit: "pcs", section: "packaging", item_type: "ingredient", item_category: "包材" },
      { key: "box_16",      label: "NEW BOX 16",        unit: "pcs", section: "packaging", item_type: "ingredient", item_category: "包材" },
      { key: "box_24",      label: "NEW BOX 24",        unit: "pcs", section: "packaging", item_type: "ingredient", item_category: "包材" },
      { key: "roll_box_1",  label: "1-Roll Box",        unit: "pcs", section: "packaging", item_type: "ingredient", item_category: "包材" },
      { key: "roll_box_2",  label: "2-Roll Box",        unit: "pcs", section: "packaging", item_type: "ingredient", item_category: "包材" },
      { key: "temaki_box",  label: "Temaki Box",        unit: "pcs", section: "packaging", item_type: "menu_item",  item_category: "包材" },
      { key: "momo_box",    label: "Momo Box",          unit: "pcs", section: "packaging", item_type: "ingredient", item_category: "包材" },
      { key: "cutlery_1",   label: "Cutlery Set 1",     unit: "set", section: "packaging", item_type: "ingredient", item_category: "包材" },
      { key: "cutlery_2",   label: "Cutlery Set 2",     unit: "set", section: "packaging", item_type: "ingredient", item_category: "包材" },
      { key: "cutlery_4",   label: "Cutlery Set 4",     unit: "set", section: "packaging", item_type: "ingredient", item_category: "包材" },
      { key: "chopsticks",  label: "Chopsticks",        unit: "pcs", section: "packaging", item_type: "ingredient", item_category: "包材" },
    ],
  },
  {
    id: "prep",
    label: "Prepared Ingredients",
    labelJa: "仕込み品・食材",
    items: [
      { key: "cucumber",         label: "Cucumber",                  unit: "kg",        section: "prep", item_type: "ingredient", item_category: "野菜" },
      { key: "shredded_leeks",   label: "Shredded Leeks",            unit: "container", section: "prep", item_type: "menu_item",  item_category: "Processed Ingredients" },
      { key: "chives",           label: "Chives",                    unit: "container", section: "prep", item_type: "ingredient", item_category: "野菜" },
      { key: "chilli",           label: "Chilli (Red & Green)",      unit: "container", section: "prep", item_type: "ingredient", item_category: "野菜" },
      { key: "cream_cheese",     label: "Cream Cheese (Piping Bag)", unit: "bag",       section: "prep", item_type: "ingredient", item_category: "調味料" },
      { key: "crabstick_packs",  label: "Crab Stick Packs",          unit: "pkt",       section: "prep", item_type: "ingredient", item_category: "加工肉・卵" },
      { key: "crabstick_top",    label: "Topping Crab Sticks",       unit: "container", section: "prep", item_type: "ingredient", item_category: "加工肉・卵" },
      { key: "dumplings",        label: "Chicken Dumplings",         unit: "tray",      section: "prep", item_type: "menu_item",  item_category: "CK加工品" },
      { key: "teriyaki_chicken", label: "Teriyaki Chicken Portion",  unit: "kg",        section: "prep", item_type: "menu_item",  item_category: "加工食材原価" },
      { key: "beef_marinated",   label: "Beef Marinated Portion",    unit: "pcs",       section: "prep", item_type: "menu_item",  item_category: "Processed Ingredients" },
      { key: "fried_chicken",    label: "Fried Chicken",             unit: "kg",        section: "prep", item_type: "menu_item",  item_category: "CK加工品" },
      { key: "stretched_shrimp", label: "Stretched Shrimp",         unit: "tray",      section: "prep", item_type: "ingredient", item_category: "鮮魚" },
      { key: "shrimp_tempura",   label: "Shrimp Tempura",            unit: "pcs",       section: "prep", item_type: "menu_item",  item_category: "Processed Ingredients" },
      { key: "avocado_tempura",  label: "Avocado Tempura",           unit: "rolls",     section: "prep", item_type: "menu_item",  item_category: "Processed Ingredients" },
      { key: "shiitake_tempura", label: "Shiitake Tempura",          unit: "rolls",     section: "prep", item_type: "menu_item",  item_category: "Processed Ingredients" },
      { key: "french_fries",     label: "French Fries",              unit: "pcs",       section: "prep", item_type: "ingredient", item_category: "野菜" },
    ],
  },
  {
    id: "toppings",
    label: "Toppings & Flakes",
    labelJa: "トッピング・フレーク",
    items: [
      { key: "chips_oman",       label: "Chips Oman",              unit: "container", section: "toppings", item_type: "ingredient", item_category: "乾物・他" },
      { key: "tf_white",         label: "Tempura Flakes (White)",  unit: "container", section: "toppings", item_type: "menu_item",  item_category: "CK加工品" },
      { key: "tf_orange",        label: "Tempura Flakes (Orange)", unit: "container", section: "toppings", item_type: "menu_item",  item_category: "CK加工品" },
      { key: "tf_yellow",        label: "Tempura Flakes (Yellow)", unit: "container", section: "toppings", item_type: "menu_item",  item_category: "加工品マスタ" },
      { key: "tf_green",         label: "Tempura Flakes (Green)",  unit: "container", section: "toppings", item_type: "menu_item",  item_category: "加工品マスタ" },
    ],
  },
  {
    id: "rolls",
    label: "Sushi Rolls (Backup Ready)",
    labelJa: "仕込みロール",
    items: [
      { key: "california",        label: "California Roll",       unit: "pcs", section: "rolls", item_type: "menu_item", item_category: "Signature Roll" },
      { key: "philadelphia",      label: "Philadelphia Roll",     unit: "pcs", section: "rolls", item_type: "menu_item", item_category: "Signature Roll" },
      { key: "spicy_tuna",        label: "Spicy Tuna Roll",       unit: "pcs", section: "rolls", item_type: "menu_item", item_category: "Signature Roll" },
      { key: "shrimp_tempura_r",  label: "Shrimp Tempura Roll",   unit: "pcs", section: "rolls", item_type: "menu_item", item_category: "Signature Roll" },
      { key: "salmon_blossom",    label: "Salmon Blossom",        unit: "pcs", section: "rolls", item_type: "menu_item", item_category: "Signature Roll" },
      { key: "tropical_salmon",   label: "Tropical Salmon",       unit: "pcs", section: "rolls", item_type: "menu_item", item_category: "Signature Roll" },
      { key: "tropical_mango",    label: "Tropical Mango",        unit: "pcs", section: "rolls", item_type: "menu_item", item_category: "Signature Roll" },
      { key: "salmon_special",    label: "Salmon Special",        unit: "pcs", section: "rolls", item_type: "menu_item", item_category: "Signature Roll" },
      { key: "seared_salmon",     label: "Seared Salmon",         unit: "pcs", section: "rolls", item_type: "menu_item", item_category: "Signature Roll" },
      { key: "seared_tuna",       label: "Seared Tuna",           unit: "pcs", section: "rolls", item_type: "menu_item", item_category: "Signature Roll" },
      { key: "dynamite",          label: "Dynamite Shrimp Roll",  unit: "pcs", section: "rolls", item_type: "menu_item", item_category: "寿司ロール" },
      { key: "crab_rock",         label: "Crab Rock Roll",        unit: "pcs", section: "rolls", item_type: "menu_item", item_category: "Signature Roll" },
      { key: "dragon",            label: "Dragon Roll",           unit: "pcs", section: "rolls", item_type: "menu_item", item_category: "Signature Roll" },
      { key: "chicken_cutlet_r",  label: "Chicken Cutlet Roll",   unit: "pcs", section: "rolls", item_type: "menu_item", item_category: "Signature Roll" },
      { key: "teriyaki_r",        label: "Teriyaki Chicken Roll", unit: "pcs", section: "rolls", item_type: "menu_item", item_category: "Signature Roll" },
      { key: "salmon_hosomaki",   label: "Salmon Hosomaki",       unit: "pcs", section: "rolls", item_type: "menu_item", item_category: "握り・刺身" },
      { key: "cucumber_hosomaki", label: "Cucumber Hosomaki",     unit: "pcs", section: "rolls", item_type: "menu_item", item_category: "握り・刺身" },
      { key: "tuna_hosomaki",     label: "Tuna Hosomaki",         unit: "pcs", section: "rolls", item_type: "menu_item", item_category: "握り・刺身" },
    ],
  },
  {
    id: "boxes",
    label: "Box Sets",
    labelJa: "ボックスセット",
    items: [
      { key: "aura_12",       label: "Aura Box 12pcs",      unit: "box", section: "boxes", item_type: "menu_item", item_category: "Sushi Box Menu原価" },
      { key: "aura_16",       label: "Aura Box 16pcs",      unit: "box", section: "boxes", item_type: "menu_item", item_category: "Sushi Box Menu原価" },
      { key: "aura_24",       label: "Aura Box 24pcs",      unit: "box", section: "boxes", item_type: "menu_item", item_category: "Sushi Box Menu原価" },
      { key: "best_seller",   label: "Best Seller Box",     unit: "box", section: "boxes", item_type: "menu_item", item_category: "Sushi Box" },
      { key: "salmon_lover_12", label: "Salmon Lover 12pcs",unit: "box", section: "boxes", item_type: "menu_item", item_category: "Sushi Box" },
    ],
  },
];

// ─── Types ───────────────────────────────────────────────────────────────────

type TemplateQty = Record<string, string>; // key → qty string

interface FreeLineItem {
  _key: string;
  item_type: "menu_item" | "ingredient";
  item_id: number | null;
  item_name_snapshot: string;
  item_category: string;
  quantity: string;
  unit: string;
  notes: string;
}

interface SearchItem {
  id: number;
  item_type: "menu_item" | "ingredient";
  category: string;
  name: string;
  default_unit: string;
}

interface BackupReport {
  id: number;
  city: string;
  branch_code: string;
  report_date: string;
  reported_by: string;
  shift: string;
  notes: string;
  status: string;
  created_at: string;
  lines: BackupReportLine[];
}

interface BackupReportLine {
  id: number;
  section: string;
  item_type: string;
  item_name_snapshot: string;
  item_category: string;
  quantity: number;
  unit: string;
  notes: string;
}

const SHIFT_OPTIONS = ["closing", "morning", "midday", "all_day"] as const;
type Shift = (typeof SHIFT_OPTIONS)[number];
const SHIFT_LABELS: Record<Shift, string> = {
  closing: "Closing",
  morning: "Morning",
  midday: "Midday",
  all_day: "All Day",
};

const SECTION_LABELS: Record<string, string> = {
  supplies:  "Condiments & Supplies",
  packaging: "Packaging",
  prep:      "Prepared Ingredients",
  toppings:  "Toppings & Flakes",
  rolls:     "Sushi Rolls",
  boxes:     "Box Sets",
  extra:     "Extra Items",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayStr() { return new Date().toISOString().slice(0, 10); }
let _k = 0;
function nextKey() { return `fl_${++_k}`; }

function emptyFreeLine(): FreeLineItem {
  return { _key: nextKey(), item_type: "ingredient", item_id: null,
           item_name_snapshot: "", item_category: "", quantity: "1", unit: "pcs", notes: "" };
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const auth = getAuth();
  const res = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(getAuthHeaders(auth) ?? {}),
      ...(options.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    const j = text ? JSON.parse(text) : {};
    throw new Error(j?.detail || j?.message || text || `HTTP ${res.status}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

// ─── Item Search Combobox (reused from disposal) ─────────────────────────────

function ItemSearch({ city, onSelect }: { city: City; onSelect: (item: SearchItem) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); setOpen(false); return; }
    setLoading(true);
    try {
      const data = await apiFetch<{ items: SearchItem[] }>(
        `/api/admin/disposal/items/search?city=${city}&q=${encodeURIComponent(q)}&limit=20`
      );
      setResults(data.items ?? []);
      setOpen(true);
    } catch { setResults([]); }
    finally { setLoading(false); }
  }, [city]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={wrapRef} className="relative">
      <input
        className={INPUT_CLASS}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          if (debRef.current) clearTimeout(debRef.current);
          debRef.current = setTimeout(() => search(e.target.value), 250);
        }}
        placeholder="アイテム名を入力して追加..."
        autoComplete="off"
      />
      {loading && <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">searching...</div>}
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-white/10 bg-zinc-900 shadow-2xl overflow-hidden">
          {results.map((item) => (
            <button key={`${item.item_type}_${item.id}`} type="button"
              onMouseDown={() => { onSelect(item); setQuery(""); setResults([]); setOpen(false); }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-violet-500/15 transition-colors">
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 w-14">
                {item.item_type === "menu_item" ? "MENU" : "INGR"}
              </span>
              <span className="flex-1 text-white">{item.name}</span>
              <span className="shrink-0 text-xs text-zinc-500">{item.category}</span>
              <span className="shrink-0 text-xs text-violet-400">{item.default_unit}</span>
            </button>
          ))}
        </div>
      )}
      {open && !loading && results.length === 0 && query.trim() && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-white/10 bg-zinc-900 px-4 py-3 text-sm text-zinc-500 shadow-2xl">
          No items found
        </div>
      )}
    </div>
  );
}

// ─── Past Reports Panel ───────────────────────────────────────────────────────

function PastReports({ city, branchCode, isAdmin }: { city: City; branchCode: BranchCode; isAdmin: boolean }) {
  const [reports, setReports] = useState<BackupReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(todayStr);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const p = new URLSearchParams({ city, branch_code: branchCode, date_from: dateFrom, date_to: dateTo, limit: "30" });
      const data = await apiFetch<{ reports: BackupReport[] }>(`/api/admin/backup/reports?${p}`);
      setReports(data.reports ?? []);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [city, branchCode, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this backup report?")) return;
    try {
      await apiFetch(`/api/admin/backup/report/${id}?city=${city}`, { method: "DELETE" });
      setReports((prev) => prev.filter((r) => r.id !== id));
    } catch (e: unknown) { alert(e instanceof Error ? e.message : String(e)); }
  };

  // Group lines by section
  const groupBySection = (lines: BackupReportLine[]) => {
    const groups: Record<string, BackupReportLine[]> = {};
    for (const l of lines) {
      const s = l.section || "extra";
      if (!groups[s]) groups[s] = [];
      groups[s].push(l);
    }
    return groups;
  };

  return (
    <div className={`${GLASS_CARD} p-6 mt-6`}>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <h2 className={T_CARD_TITLE}>Past Reports</h2>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-sm text-white outline-none focus:border-violet-500/50 w-36" />
          <span className="text-zinc-500 text-sm">–</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-sm text-white outline-none focus:border-violet-500/50 w-36" />
          <button onClick={load} className={SMALL_BUTTON}>Reload</button>
        </div>
      </div>
      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
      {loading && <p className="text-sm text-zinc-500">Loading...</p>}
      {!loading && reports.length === 0 && <p className="text-sm text-zinc-500">No reports found.</p>}

      <div className="space-y-2">
        {reports.map((r) => {
          const groups = groupBySection(r.lines ?? []);
          const nonZero = (r.lines ?? []).filter(l => Number(l.quantity) > 0).length;
          return (
            <div key={r.id} className="rounded-xl border border-white/8 bg-white/3 overflow-hidden">
              <div className="flex flex-wrap items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/5 transition-colors"
                onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                <span className="font-mono text-xs text-zinc-500">#{r.id}</span>
                <span className="text-sm font-semibold text-white">{r.report_date}</span>
                <span className="text-xs text-zinc-400">{r.branch_code}</span>
                <span className={BADGE_INFO}>{r.shift}</span>
                <span className="text-xs text-zinc-400">by {r.reported_by}</span>
                <span className="text-xs text-zinc-500 ml-auto">{nonZero} items reported</span>
                {isAdmin && (
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(r.id); }}
                    className="text-xs text-red-400 hover:text-red-300 transition-colors px-2 py-1">
                    Delete
                  </button>
                )}
              </div>

              {expanded === r.id && (
                <div className="border-t border-white/8 px-4 py-3 space-y-3">
                  {r.notes && <p className="text-xs text-zinc-400 italic">{r.notes}</p>}
                  {Object.entries(groups).map(([sec, lines]) => {
                    const hasQty = lines.filter(l => Number(l.quantity) > 0);
                    if (hasQty.length === 0 && sec !== "extra") return null;
                    const sectionKey = `${r.id}_${sec}`;
                    return (
                      <div key={sec}>
                        <button
                          className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 hover:text-zinc-300 transition-colors mb-1"
                          onClick={() => setExpandedSection(expandedSection === sectionKey ? null : sectionKey)}
                        >
                          <span>{SECTION_LABELS[sec] ?? sec}</span>
                          <span className="text-violet-500">({hasQty.length})</span>
                          <span>{expandedSection === sectionKey ? "▲" : "▼"}</span>
                        </button>
                        {expandedSection === sectionKey && (
                          <table className="w-full text-sm">
                            <tbody>
                              {hasQty.map((l) => (
                                <tr key={l.id} className={TABLE_ROW}>
                                  <td className={`${TABLE_CELL} text-white`}>{l.item_name_snapshot}</td>
                                  <td className={`${TABLE_CELL} text-right font-mono text-violet-300`}>{l.quantity}</td>
                                  <td className={`${TABLE_CELL} text-zinc-400 pl-1`}>{l.unit}</td>
                                  <td className={`${TABLE_CELL} text-zinc-500 text-xs`}>{l.notes}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Template Section Input ───────────────────────────────────────────────────

function TemplateSectionBlock({
  section,
  qty,
  onChange,
}: {
  section: TemplateSection;
  qty: TemplateQty;
  onChange: (key: string, val: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="rounded-xl border border-white/8 bg-white/3 overflow-hidden">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">{section.label}</span>
          <span className="text-xs text-zinc-500">{section.labelJa}</span>
        </div>
        <span className="text-zinc-500 text-sm">{collapsed ? "▼" : "▲"}</span>
      </button>

      {!collapsed && (
        <div className="border-t border-white/8 px-4 py-3">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 md:grid-cols-4">
            {section.items.map((item) => (
              <div key={item.key}>
                <label className={`${T_LABEL} block mb-1 truncate`} title={item.label}>
                  {item.label}
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className="w-full rounded-lg border border-white/10 bg-white/6 px-2 py-1.5 text-sm text-white text-right outline-none focus:border-violet-500/40 focus:ring-1 focus:ring-violet-500/20"
                    value={qty[item.key] ?? ""}
                    placeholder="0"
                    onChange={(e) => onChange(item.key, e.target.value)}
                  />
                  <span className="shrink-0 text-[10px] text-zinc-500 w-10 truncate">{item.unit}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BackupReportPage() {
  const auth = useMemo(() => getAuth(), []);
  const role = auth?.role ?? "";
  const isAdmin = role === "ADMIN" || role === "HQ";

  // Header
  const [city, setCity] = useState<City>("dubai");
  const [branchCode, setBranchCode] = useState<BranchCode>("BB");
  const [reportDate, setReportDate] = useState(todayStr);
  const [reportedBy, setReportedBy] = useState(auth?.staffName ?? "");
  const [shift, setShift] = useState<Shift>("closing");
  const [headerNotes, setHeaderNotes] = useState("");

  // Template quantities: key → qty
  const [templateQty, setTemplateQty] = useState<TemplateQty>({});

  // Free-form extra lines
  const [freeLines, setFreeLines] = useState<FreeLineItem[]>([]);

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");

  useEffect(() => {
    const branches = BRANCHES[city];
    if (branches.length > 0) setBranchCode(branches[0].code);
  }, [city]);

  const handleQtyChange = useCallback((key: string, val: string) => {
    setTemplateQty((prev) => ({ ...prev, [key]: val }));
  }, []);

  const addFreeItem = useCallback((item: SearchItem) => {
    setFreeLines((prev) => [
      ...prev,
      { _key: nextKey(), item_type: item.item_type, item_id: item.id,
        item_name_snapshot: item.name, item_category: item.category,
        quantity: "1", unit: item.default_unit || "pcs", notes: "" },
    ]);
  }, []);

  const updateFreeLine = useCallback((key: string, patch: Partial<FreeLineItem>) => {
    setFreeLines((prev) => prev.map((l) => l._key === key ? { ...l, ...patch } : l));
  }, []);

  const removeFreeLine = useCallback((key: string) => {
    setFreeLines((prev) => prev.filter((l) => l._key !== key));
  }, []);

  const handleSubmit = async () => {
    if (!reportedBy.trim()) { setSubmitError("Please enter the reporter name."); return; }

    // Build lines from template (only non-empty / non-zero)
    const lines: object[] = [];

    for (const sec of TEMPLATE_SECTIONS) {
      for (const item of sec.items) {
        const rawQty = templateQty[item.key] ?? "";
        const qty = parseFloat(rawQty);
        if (isNaN(qty) || qty < 0) continue;
        // Include even 0s to record "confirmed zero" for template items that were filled
        if (rawQty === "") continue; // untouched fields = skip
        lines.push({
          section: sec.id,
          item_type: item.item_type,
          item_id: null,
          item_name_snapshot: item.label,
          item_category: item.item_category,
          quantity: qty,
          unit: item.unit,
          notes: "",
        });
      }
    }

    // Free-form lines
    for (const fl of freeLines) {
      if (!fl.item_name_snapshot.trim()) continue;
      const qty = parseFloat(fl.quantity);
      if (isNaN(qty) || qty <= 0) continue;
      lines.push({
        section: "extra",
        item_type: fl.item_type,
        item_id: fl.item_id,
        item_name_snapshot: fl.item_name_snapshot,
        item_category: fl.item_category,
        quantity: qty,
        unit: fl.unit,
        notes: fl.notes,
      });
    }

    if (lines.length === 0) { setSubmitError("No items entered. Please fill in at least one quantity."); return; }

    setSubmitting(true); setSubmitError(""); setSubmitSuccess("");
    try {
      const result = await apiFetch<{ report_id: number; status: string }>(
        "/api/admin/backup/report",
        {
          method: "POST",
          body: JSON.stringify({
            city, branch_code: branchCode, report_date: reportDate,
            reported_by: reportedBy.trim(), shift, notes: headerNotes.trim(), lines,
          }),
        }
      );
      setSubmitSuccess(`Report #${result.report_id} submitted successfully.`);
      setTemplateQty({});
      setFreeLines([]);
      setHeaderNotes("");
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-violet-950/20 to-slate-950 p-6">
      <div className="mx-auto max-w-5xl space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className={T_PAGE_TITLE}>Backup Report</h1>
            <p className="mt-1 text-sm text-zinc-500">
              CKからの仕込み出荷・在庫バックアップ報告
            </p>
          </div>
          <Link href="/admin" className={SECONDARY_BUTTON}>&larr; Admin</Link>
        </div>

        {/* Report Details */}
        <div className={`${GLASS_CARD} p-6`}>
          <h2 className={`${T_CARD_TITLE} mb-4`}>Report Details</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div>
              <label className={`${T_LABEL} block mb-1.5`}>City</label>
              <select className={SELECT_CLASS} value={city} onChange={(e) => setCity(e.target.value as City)}>
                <option value="dubai">Dubai</option>
                <option value="manila">Manila</option>
              </select>
            </div>
            <div>
              <label className={`${T_LABEL} block mb-1.5`}>Branch</label>
              <select className={SELECT_CLASS} value={branchCode} onChange={(e) => setBranchCode(e.target.value as BranchCode)}>
                {BRANCHES[city].map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className={`${T_LABEL} block mb-1.5`}>Date</label>
              <input type="date" className={INPUT_CLASS} value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
            </div>
            <div>
              <label className={`${T_LABEL} block mb-1.5`}>Reported By</label>
              <input type="text" className={INPUT_CLASS} value={reportedBy}
                onChange={(e) => setReportedBy(e.target.value)} placeholder="Staff name" />
            </div>
            <div>
              <label className={`${T_LABEL} block mb-1.5`}>Shift</label>
              <select className={SELECT_CLASS} value={shift} onChange={(e) => setShift(e.target.value as Shift)}>
                {SHIFT_OPTIONS.map((s) => <option key={s} value={s}>{SHIFT_LABELS[s]}</option>)}
              </select>
            </div>
            <div>
              <label className={`${T_LABEL} block mb-1.5`}>Notes (optional)</label>
              <input type="text" className={INPUT_CLASS} value={headerNotes}
                onChange={(e) => setHeaderNotes(e.target.value)} placeholder="e.g. holiday, event..." />
            </div>
          </div>
        </div>

        {/* Fixed Template Sections */}
        <div className={`${GLASS_CARD} p-6`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className={T_CARD_TITLE}>Fixed Items</h2>
            <span className={`${T_CAPTION} text-zinc-500`}>
              数量を入力（空欄 = 報告なし、0 = ゼロ確認）
            </span>
          </div>
          <div className="space-y-3">
            {TEMPLATE_SECTIONS.map((sec) => (
              <TemplateSectionBlock
                key={sec.id}
                section={sec}
                qty={templateQty}
                onChange={handleQtyChange}
              />
            ))}
          </div>
        </div>

        {/* Free-form Extra Section */}
        <div className={`${GLASS_CARD} p-6`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className={T_CARD_TITLE}>Extra Items</h2>
            <span className={`${BADGE_WARNING}`}>自由追記</span>
          </div>
          <div className="mb-4">
            <label className={`${T_LABEL} block mb-1.5`}>Add Item</label>
            <ItemSearch city={city} onSelect={addFreeItem} />
          </div>

          {freeLines.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[580px]">
                <thead>
                  <tr>
                    <th className={`${TABLE_HEADER} text-left w-[35%]`}>Item</th>
                    <th className={`${TABLE_HEADER} text-right w-[12%]`}>Qty</th>
                    <th className={`${TABLE_HEADER} text-left w-[10%]`}>Unit</th>
                    <th className={`${TABLE_HEADER} text-left w-[35%]`}>Notes</th>
                    <th className={`${TABLE_HEADER} text-center w-[8%]`}></th>
                  </tr>
                </thead>
                <tbody>
                  {freeLines.map((fl) => (
                    <tr key={fl._key} className={TABLE_ROW}>
                      <td className="py-2 pr-2 text-white text-sm">{fl.item_name_snapshot}</td>
                      <td className="py-2 pr-2">
                        <input type="number" min="0" step="1"
                          className="w-full rounded-lg border border-white/10 bg-white/6 px-2 py-1.5 text-sm text-white text-right outline-none focus:border-violet-500/40"
                          value={fl.quantity} onChange={(e) => updateFreeLine(fl._key, { quantity: e.target.value })} />
                      </td>
                      <td className="py-2 pr-2">
                        <input type="text"
                          className="w-full rounded-lg border border-white/10 bg-white/6 px-2 py-1.5 text-sm text-white outline-none focus:border-violet-500/40"
                          value={fl.unit} onChange={(e) => updateFreeLine(fl._key, { unit: e.target.value })} />
                      </td>
                      <td className="py-2 pr-2">
                        <input type="text"
                          className="w-full rounded-lg border border-white/10 bg-white/6 px-2 py-1.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-violet-500/40"
                          value={fl.notes} onChange={(e) => updateFreeLine(fl._key, { notes: e.target.value })}
                          placeholder="optional" />
                      </td>
                      <td className="py-2 text-center">
                        <button type="button" onClick={() => removeFreeLine(fl._key)}
                          className="text-zinc-600 hover:text-red-400 transition-colors text-lg leading-none">&times;</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-3">
            <button type="button" onClick={() => setFreeLines((prev) => [...prev, emptyFreeLine()])}
              className={SMALL_BUTTON}>+ 空白行を追加</button>
          </div>
        </div>

        {/* Submit */}
        <div className="flex flex-wrap items-center gap-4">
          <button onClick={handleSubmit} disabled={submitting} className={PRIMARY_BUTTON}>
            {submitting ? "Submitting..." : "Submit Backup Report"}
          </button>
          <button type="button" className={SECONDARY_BUTTON}
            onClick={() => { setTemplateQty({}); setFreeLines([]); setHeaderNotes(""); setSubmitSuccess(""); setSubmitError(""); }}>
            Clear
          </button>
          {submitError && <p className="text-sm text-red-400">{submitError}</p>}
          {submitSuccess && <p className="text-sm text-emerald-400">{submitSuccess}</p>}
        </div>

        {/* Past Reports */}
        <PastReports city={city} branchCode={branchCode} isAdmin={isAdmin} />

      </div>
    </main>
  );
}

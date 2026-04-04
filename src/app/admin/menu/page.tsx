"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  FolderOpen,
  LayoutDashboard,
  Layers,
  Package,
  ShoppingBag,
  User,
  UtensilsCrossed,
} from "lucide-react";
import { canAccessMenuAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import {
  HIGHLIGHT_CARD,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  STATUS_CARD,
  T_BODY,
  T_CAPTION,
  T_CARD_TITLE,
  T_PAGE_TITLE,
  BADGE_INFO,
  DIVIDER,
} from "@/lib/ui-tokens";

const MODULES = [
  {
    title: "Categories",
    description: "Register the product folders used to organize the sales menu.",
    href: "/admin/menu/categories",
    icon: FolderOpen,
    iconWrapClass: "bg-sky-500/15 border-sky-500/20",
    iconClass: "text-sky-400",
  },
  {
    title: "Products",
    description: "Create sales products, assign categories, and open product detail for ingredient setup.",
    href: "/admin/menu/products",
    icon: ShoppingBag,
    iconWrapClass: "bg-emerald-500/15 border-emerald-500/20",
    iconClass: "text-emerald-400",
  },
  {
    title: "Phase 1 Scope",
    description: "Product detail includes ingredients editor and cost summary. Modifiers, tags, prices, combos, and groups follow in later phases.",
    href: "",
    icon: Layers,
    iconWrapClass: "bg-violet-500/15 border-violet-500/20",
    iconClass: "text-violet-400",
  },
];

export default function AdminMenuPage() {
  const initialAuth = useMemo(() => getAuth(), []);
  const [allowed, setAllowed] = useState(false);
  const [ready, setReady] = useState(false);
  const [staffName, setStaffName] = useState(initialAuth?.staffName || "");
  const [city, setCity] = useState((initialAuth?.city || "manila").toUpperCase());
  const [role, setRole] = useState((initialAuth?.role || "").toString().toUpperCase());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const auth = getAuth();
      const resolved = await refreshAuthFromApi(auth);
      if (cancelled) return;
      setAllowed(canAccessMenuAdmin(resolved));
      setStaffName(resolved?.staffName || auth?.staffName || "");
      setCity((resolved?.city || auth?.city || "manila").toUpperCase());
      setRole((resolved?.role || auth?.role || "").toString().toUpperCase());
      setReady(true);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return <div className="text-sm text-neutral-500">Loading menu workspace...</div>;
  }

  if (!allowed) {
    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="text-lg font-semibold text-neutral-100">Menu Builder</div>
        <div className="mt-2 text-sm text-neutral-400">You do not have permission to open the menu workspace.</div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="mx-auto max-w-5xl px-4 py-6"
    >
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/25 bg-amber-500/15">
            <UtensilsCrossed className="h-5 w-5 text-violet-400" />
          </div>
          <div>
            <h1 className={T_PAGE_TITLE}>Menu Builder</h1>
            <p className={T_BODY}>Independent workspace for sales menu registration.</p>
          </div>
        </div>
        <span className={BADGE_INFO}>
          <User className="h-3 w-3" />
          {staffName || "Session"} · {role || "STAFF"} · {city}
        </span>
      </div>

      <div className={`${HIGHLIGHT_CARD} mb-6 p-5`}>
        <div className="mb-4 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-violet-400" />
          <h2 className={T_CARD_TITLE}>Phase 1 Workflow</h2>
        </div>
        <div className="flex flex-col gap-3">
          {[
            { step: 1, text: "Create menu categories first." },
            { step: 2, text: "Create products and assign each product to a category." },
            { step: 3, text: "Open product detail and add ingredient lines from inventory items." },
            { step: 4, text: "Review the automatic cost summary before later phases expand tags, modifiers, and prices." },
          ].map(({ step, text }) => (
            <div key={step} className="flex items-start gap-3">
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/20 text-xs font-bold text-violet-400">
                {step}
              </span>
              <p className="text-sm leading-relaxed text-zinc-300">{text}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-8 flex flex-wrap gap-3">
        <Link href="/admin" className={SECONDARY_BUTTON}>
          <LayoutDashboard className="mr-1.5 h-4 w-4" />
          Back to Admin Dashboard
        </Link>
        <Link href="/admin/inventory" className={PRIMARY_BUTTON}>
          <Package className="mr-1.5 h-4 w-4" />
          Open Inventory
          <ChevronRight className="ml-1 h-4 w-4" />
        </Link>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        {MODULES.map((module) => {
          const Icon = module.icon;
          const content = (
            <>
              <div className="mb-3 flex items-center gap-2">
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg border ${module.iconWrapClass}`}>
                  <Icon className={`h-4 w-4 ${module.iconClass}`} />
                </div>
                <h3 className={T_CARD_TITLE}>{module.title}</h3>
              </div>
              <p className={T_BODY}>{module.description}</p>
              {module.href ? (
                <div className="mt-4 flex items-center gap-1 text-xs font-medium text-violet-400 transition-all duration-150 group-hover:gap-2">
                  Open <ArrowRight className="h-3 w-3" />
                </div>
              ) : null}
            </>
          );

          if (!module.href) {
            return (
              <div key={module.title} className={`${STATUS_CARD} p-5`}>
                {content}
              </div>
            );
          }

          return (
            <Link
              key={module.title}
              href={module.href}
              className={`${STATUS_CARD} group block p-5 transition-all duration-200 hover:border-white/20`}
            >
              {content}
            </Link>
          );
        })}
      </div>

      <div className={DIVIDER} />
      <p className={`${T_CAPTION} text-center`}>
        Vercel PWA (frontend) · Heroku API (backend)
      </p>
    </motion.div>
  );
}

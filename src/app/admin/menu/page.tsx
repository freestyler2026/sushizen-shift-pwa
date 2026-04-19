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
  Package,
  ShoppingBag,
  Tag,
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

type City = "dubai" | "manila";

const CITY_CONFIG: Record<City, {
  label: string;
  flag: string;
  currency: string;
  accent: string;
  borderClass: string;
  iconBg: string;
  badgeClass: string;
}> = {
  dubai: {
    label: "Dubai",
    flag: "🇦🇪",
    currency: "AED",
    accent: "text-amber-400",
    borderClass: "border-amber-500/30 hover:border-amber-400/60",
    iconBg: "bg-amber-500/15 border-amber-500/20",
    badgeClass: "bg-amber-500/10 border border-amber-500/20 text-amber-300",
  },
  manila: {
    label: "Manila",
    flag: "🇵🇭",
    currency: "PHP",
    accent: "text-sky-400",
    borderClass: "border-sky-500/30 hover:border-sky-400/60",
    iconBg: "bg-sky-500/15 border-sky-500/20",
    badgeClass: "bg-sky-500/10 border border-sky-500/20 text-sky-300",
  },
};

function CityMenuBuilder({ city, onBack }: { city: City; onBack: () => void }) {
  const cfg = CITY_CONFIG[city];

  const modules = [
    {
      title: "Categories",
      description: "Register the product folders used to organize the sales menu.",
      href: `/admin/menu/categories?city=${city}`,
      icon: FolderOpen,
      iconWrapClass: cfg.iconBg,
      iconClass: cfg.accent,
    },
    {
      title: "Products",
      description: "Create sales products, assign categories, and open product detail for ingredient setup.",
      href: `/admin/menu/products?city=${city}`,
      icon: ShoppingBag,
      iconWrapClass: cfg.iconBg,
      iconClass: cfg.accent,
    },
    {
      title: "Tags",
      description: "Manage product tags for filtering and grouping menu items.",
      href: `/admin/menu/tags?city=${city}`,
      icon: Tag,
      iconWrapClass: cfg.iconBg,
      iconClass: cfg.accent,
    },
  ];

  return (
    <motion.div
      key={city}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
    >
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={onBack}
          className="text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
        >
          ← Menu Builder
        </button>
        <span className="text-neutral-600">/</span>
        <span className={`text-sm font-semibold ${cfg.accent}`}>
          {cfg.flag} {cfg.label}
        </span>
      </div>

      <div className={`${HIGHLIGHT_CARD} mb-6 p-5`}>
        <div className="mb-1 flex items-center gap-2">
          <CheckCircle2 className={`h-4 w-4 ${cfg.accent}`} />
          <h2 className={T_CARD_TITLE}>{cfg.flag} {cfg.label} Menu Builder</h2>
          <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium ${cfg.badgeClass}`}>
            {cfg.currency}
          </span>
        </div>
        <p className={`${T_BODY} mt-1`}>
          Manage categories and products for the {cfg.label} operation.
        </p>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        {modules.map((module) => {
          const Icon = module.icon;
          return (
            <Link
              key={module.title}
              href={module.href}
              className={`${STATUS_CARD} group block p-5 transition-all duration-200 hover:border-white/20`}
            >
              <div className="mb-3 flex items-center gap-2">
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg border ${module.iconWrapClass}`}>
                  <Icon className={`h-4 w-4 ${module.iconClass}`} />
                </div>
                <h3 className={T_CARD_TITLE}>{module.title}</h3>
              </div>
              <p className={T_BODY}>{module.description}</p>
              <div className={`mt-4 flex items-center gap-1 text-xs font-medium ${cfg.accent} transition-all duration-150 group-hover:gap-2`}>
                Open <ArrowRight className="h-3 w-3" />
              </div>
            </Link>
          );
        })}
      </div>
    </motion.div>
  );
}

export default function AdminMenuPage() {
  const initialAuth = useMemo(() => getAuth(), []);
  const [allowed, setAllowed] = useState(false);
  const [ready, setReady] = useState(false);
  const [staffName, setStaffName] = useState(initialAuth?.staffName || "");
  const [role, setRole] = useState((initialAuth?.role || "").toString().toUpperCase());
  const [selectedCity, setSelectedCity] = useState<City | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const auth = getAuth();
      const resolved = await refreshAuthFromApi(auth);
      if (cancelled) return;
      setAllowed(canAccessMenuAdmin(resolved));
      setStaffName(resolved?.staffName || auth?.staffName || "");
      setRole((resolved?.role || auth?.role || "").toString().toUpperCase());
      setReady(true);
    }
    void load();
    return () => { cancelled = true; };
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
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-500/25 bg-violet-500/15">
            <UtensilsCrossed className="h-5 w-5 text-violet-400" />
          </div>
          <div>
            <h1 className={T_PAGE_TITLE}>Menu Builder</h1>
            <p className={T_BODY}>Sales menu workspace — select a city to manage.</p>
          </div>
        </div>
        <span className={BADGE_INFO}>
          <User className="h-3 w-3" />
          {staffName || "Session"} · {role}
        </span>
      </div>

      {/* Back button + city view */}
      {selectedCity ? (
        <CityMenuBuilder city={selectedCity} onBack={() => setSelectedCity(null)} />
      ) : (
        <>
          {/* City picker */}
          <div className="mb-8 grid grid-cols-1 gap-5 md:grid-cols-2">
            {(["dubai", "manila"] as City[]).map((city) => {
              const cfg = CITY_CONFIG[city];
              return (
                <button
                  key={city}
                  onClick={() => setSelectedCity(city)}
                  className={`group flex flex-col items-start rounded-2xl border bg-neutral-900/40 p-6 text-left transition-all duration-200 ${cfg.borderClass}`}
                >
                  <div className="mb-4 flex items-center gap-3">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-xl border text-2xl ${cfg.iconBg}`}>
                      {cfg.flag}
                    </div>
                    <div>
                      <div className={`text-lg font-bold ${cfg.accent}`}>{cfg.label}</div>
                      <div className="text-xs text-neutral-500">{cfg.currency} · Menu Builder</div>
                    </div>
                  </div>
                  <p className={`${T_BODY} mb-4`}>
                    Manage categories, products, and pricing for {cfg.label} operations.
                  </p>
                  <div className={`flex items-center gap-1 text-xs font-medium ${cfg.accent} transition-all duration-150 group-hover:gap-2`}>
                    Open {cfg.label} Menu <ArrowRight className="h-3 w-3" />
                  </div>
                </button>
              );
            })}
          </div>

          {/* Nav */}
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

          <div className={DIVIDER} />
          <p className={`${T_CAPTION} text-center`}>
            Vercel PWA (frontend) · Heroku API (backend)
          </p>
        </>
      )}
    </motion.div>
  );
}

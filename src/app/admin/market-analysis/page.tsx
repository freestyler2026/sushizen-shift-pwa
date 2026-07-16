"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import "leaflet/dist/leaflet.css";

type SpotResult = {
  rank: number;
  lat: number;
  lng: number;
  population: number;
  area: string;
  nearest_mall: string;
  mall_dist_km: number;
};

type BreakdownItem = { city: string; covered: number; fraction_pct: number };

type EstimateResult = {
  population: number;
  area_km2: number;
  breakdown: BreakdownItem[];
  nearest_mall: string;
  nearest_mall_km: number;
  note: string;
};

type RankResult = {
  population: number;
  rank: number;
  total_candidates: number;
  percentile: number;
  nearest_mall: string;
  nearest_mall_km: number;
};

type Mall = { name: string; lat: number; lng: number; brand: string };

const SPOT_COLORS = [
  "#ef4444","#f97316","#eab308","#22c55e","#06b6d4",
  "#8b5cf6","#ec4899","#14b8a6","#f59e0b","#6366f1",
  "#dc2626","#ea580c","#ca8a04","#16a34a","#0891b2",
  "#7c3aed","#db2777","#0d9488","#d97706","#4f46e5",
];

const BRAND_COLORS: Record<string, string> = {
  SM: "#0057a8",
  Ayala: "#00843d",
  Robinsons: "#e41e26",
  BGC: "#7c3aed",
  Ortigas: "#f97316",
  Rockwell: "#374151",
  Eastwood: "#0891b2",
  Other: "#6b7280",
};

function fmt(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

export default function MarketAnalysisPage() {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<unknown>(null);
  const mapInstanceRef = useRef<unknown>(null);
  const circleRef = useRef<unknown>(null);
  const pinRef = useRef<unknown>(null);
  const spotMarkersRef = useRef<unknown[]>([]);
  const mallMarkersRef = useRef<unknown[]>([]);

  const [mode, setMode] = useState<"manual" | "bestspots">("manual");
  const [radiusM, setRadiusM] = useState(3000);
  const [pinLatLng, setPinLatLng] = useState<{ lat: number; lng: number } | null>(null);
  const [estimate, setEstimate] = useState<EstimateResult | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [spots, setSpots] = useState<SpotResult[]>([]);
  const [scanning, setScanning] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [showMalls, setShowMalls] = useState(false);
  const [malls, setMalls] = useState<Mall[]>([]);
  const [mallsLoading, setMallsLoading] = useState(false);
  const [addressInput, setAddressInput] = useState("");
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState("");
  const [rankResult, setRankResult] = useState<RankResult | null>(null);

  // Initialize Leaflet map
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    let ro: ResizeObserver | null = null;

    import("leaflet").then((L) => {
      if (!mapRef.current || mapInstanceRef.current) return;
      leafletRef.current = L;

      delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const map = L.map(mapRef.current, { zoomControl: true }).setView([14.5995, 120.9842], 12);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(map);

      mapInstanceRef.current = map;
      if (mapRef.current) {
        ro = new ResizeObserver(() => map.invalidateSize());
        ro.observe(mapRef.current);
      }
      map.invalidateSize();
      setTimeout(() => map.invalidateSize(), 150);
      setTimeout(() => map.invalidateSize(), 500);
      setMapReady(true);
    });

    return () => {
      ro?.disconnect();
      if (mapInstanceRef.current) {
        (mapInstanceRef.current as import("leaflet").Map).remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update delivery circle on pin/radius change
  useEffect(() => {
    if (!mapReady || !leafletRef.current || !mapInstanceRef.current) return;
    const L = leafletRef.current as typeof import("leaflet");
    const map = mapInstanceRef.current as import("leaflet").Map;
    if (circleRef.current) { (circleRef.current as import("leaflet").Circle).remove(); circleRef.current = null; }
    if (pinLatLng) {
      circleRef.current = L.circle([pinLatLng.lat, pinLatLng.lng], {
        radius: radiusM, color: "#8b5cf6", fillColor: "#8b5cf6", fillOpacity: 0.12, weight: 2,
      }).addTo(map);
    }
  }, [pinLatLng, radiusM, mapReady]);

  // Map click → place pin (manual mode)
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current as import("leaflet").Map;
    const L = leafletRef.current as typeof import("leaflet");
    const onClick = (e: import("leaflet").LeafletMouseEvent) => {
      if (mode !== "manual") return;
      const { lat, lng } = e.latlng;
      if (pinRef.current) { (pinRef.current as import("leaflet").Marker).remove(); pinRef.current = null; }
      pinRef.current = L.marker([lat, lng]).addTo(map);
      setPinLatLng({ lat, lng });
      setEstimate(null);
      setRankResult(null);
      setAddressInput("");
    };
    map.on("click", onClick);
    return () => { map.off("click", onClick); };
  }, [mapReady, mode]);

  const clearSpotMarkers = useCallback(() => {
    spotMarkersRef.current.forEach((m) => (m as import("leaflet").Layer).remove());
    spotMarkersRef.current = [];
  }, []);

  const clearMallMarkers = useCallback(() => {
    mallMarkersRef.current.forEach((m) => (m as import("leaflet").Layer).remove());
    mallMarkersRef.current = [];
  }, []);

  const plotMalls = useCallback((mallList: Mall[]) => {
    if (!mapReady || !leafletRef.current || !mapInstanceRef.current) return;
    const L = leafletRef.current as typeof import("leaflet");
    const map = mapInstanceRef.current as import("leaflet").Map;
    clearMallMarkers();
    mallList.forEach((m) => {
      const color = BRAND_COLORS[m.brand] ?? "#6b7280";
      const icon = L.divIcon({
        html: `<div style="background:${color};color:#fff;border-radius:6px;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:13px;border:2px solid #fff;box-shadow:0 2px 5px rgba(0,0,0,0.4);">🏬</div>`,
        className: "", iconSize: [24, 24], iconAnchor: [12, 12],
      });
      const marker = L.marker([m.lat, m.lng], { icon })
        .bindPopup(`<b>${m.name}</b><br><span style="color:${color}">${m.brand}</span>`)
        .addTo(map);
      mallMarkersRef.current.push(marker as unknown);
    });
  }, [mapReady, clearMallMarkers]);

  const plotSpots = useCallback((spotsData: SpotResult[]) => {
    if (!mapReady || !leafletRef.current || !mapInstanceRef.current) return;
    const L = leafletRef.current as typeof import("leaflet");
    const map = mapInstanceRef.current as import("leaflet").Map;
    clearSpotMarkers();
    spotsData.forEach((s, i) => {
      const color = SPOT_COLORS[i % SPOT_COLORS.length];
      const icon = L.divIcon({
        html: `<div style="background:${color};color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.4);">${s.rank}</div>`,
        className: "", iconSize: [28, 28], iconAnchor: [14, 14],
      });
      const circle = L.circle([s.lat, s.lng], {
        radius: radiusM, color, fillColor: color, fillOpacity: 0.07, weight: 1.5, dashArray: "5 5",
      }).addTo(map);
      const marker = L.marker([s.lat, s.lng], { icon })
        .bindPopup(`<b>#${s.rank} ${s.area}</b><br>${fmt(s.population)} people<br>Nearest mall: ${s.nearest_mall} (${s.mall_dist_km}km)`)
        .addTo(map);
      spotMarkersRef.current.push(circle as unknown, marker as unknown);
    });
  }, [mapReady, radiusM, clearSpotMarkers]);

  // Load / unload mall markers when toggle changes
  useEffect(() => {
    if (!mapReady) return;
    if (!showMalls) { clearMallMarkers(); return; }
    if (malls.length > 0) { plotMalls(malls); return; }

    // First load
    const fetchMalls = async () => {
      setMallsLoading(true);
      try {
        const auth = getAuth();
        const res = await fetch("/api/admin/market-analysis/malls", {
          headers: getAuthHeaders(auth) ?? {},
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        setMalls(data.malls);
        plotMalls(data.malls);
      } catch (e) { alert("Failed to load malls: " + e); }
      finally { setMallsLoading(false); }
    };
    fetchMalls();
  }, [showMalls, mapReady, malls, plotMalls, clearMallMarkers]);

  const runEstimate = useCallback(async () => {
    if (!pinLatLng) return;
    setEstimating(true);
    setRankResult(null);
    try {
      const auth = getAuth();
      const res = await fetch("/api/admin/market-analysis/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(getAuthHeaders(auth) ?? {}) },
        body: JSON.stringify({ lat: pinLatLng.lat, lng: pinLatLng.lng, radius_m: radiusM }),
      });
      if (!res.ok) throw new Error(await res.text());
      setEstimate(await res.json());
    } catch (e) { alert("Estimation failed: " + e); }
    finally { setEstimating(false); }
  }, [pinLatLng, radiusM]);

  const runBestSpots = useCallback(async () => {
    setScanning(true);
    clearSpotMarkers();
    setSpots([]);
    try {
      const auth = getAuth();
      const res = await fetch("/api/admin/market-analysis/best-spots", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(getAuthHeaders(auth) ?? {}) },
        body: JSON.stringify({ radius_m: radiusM, top_n: 20 }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setSpots(data.spots);
      plotSpots(data.spots);
    } catch (e) { alert("Scan failed: " + e); }
    finally { setScanning(false); }
  }, [radiusM, clearSpotMarkers, plotSpots]);

  useEffect(() => {
    if (mode === "manual") { clearSpotMarkers(); setSpots([]); }
  }, [mode, clearSpotMarkers]);

  const geocodeAndAnalyze = useCallback(async () => {
    if (!addressInput.trim()) return;
    setGeocoding(true);
    setGeocodeError("");
    setEstimate(null);
    setRankResult(null);
    try {
      // Nominatim geocoding — restrict to Philippines
      const query = encodeURIComponent(addressInput.trim() + ", Metro Manila, Philippines");
      const geoRes = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${query}&countrycodes=ph&format=json&limit=1`,
        { headers: { "Accept-Language": "en", "User-Agent": "SushiZEN-MarketAnalysis/1.0" } }
      );
      const geoData = await geoRes.json() as Array<{ lat: string; lon: string; display_name: string }>;
      if (!geoData.length) {
        setGeocodeError("Address not found. Try a more specific Metro Manila address.");
        return;
      }
      const lat = parseFloat(geoData[0].lat);
      const lng = parseFloat(geoData[0].lon);

      // Place pin on map
      if (mapReady && leafletRef.current && mapInstanceRef.current) {
        const L = leafletRef.current as typeof import("leaflet");
        const map = mapInstanceRef.current as import("leaflet").Map;
        if (pinRef.current) { (pinRef.current as import("leaflet").Marker).remove(); pinRef.current = null; }
        pinRef.current = L.marker([lat, lng]).addTo(map);
        map.setView([lat, lng], 14);
      }
      setPinLatLng({ lat, lng });

      // Run estimate + rank in parallel
      const auth = getAuth();
      const headers = { "Content-Type": "application/json", ...(getAuthHeaders(auth) ?? {}) };
      const body = JSON.stringify({ lat, lng, radius_m: radiusM });
      const [estRes, rankRes] = await Promise.all([
        fetch("/api/admin/market-analysis/estimate", { method: "POST", headers, body }),
        fetch("/api/admin/market-analysis/rank", { method: "POST", headers, body }),
      ]);
      if (estRes.ok) setEstimate(await estRes.json() as EstimateResult);
      if (rankRes.ok) setRankResult(await rankRes.json() as RankResult);
    } catch (e) {
      setGeocodeError("Search failed: " + String(e));
    } finally {
      setGeocoding(false);
    }
  }, [addressInput, radiusM, mapReady]);

  const radiusKm = (radiusM / 1000).toFixed(1);

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <div className="border-b border-white/10 bg-neutral-900 px-4 py-4">
        <div className="mx-auto max-w-6xl">
          <h1 className="text-xl font-bold tracking-tight">Metro Manila Market Analysis</h1>
          <p className="mt-0.5 text-sm text-neutral-400">Population coverage analysis for new store location planning</p>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6">
        {/* Controls */}
        <div className="mb-4 space-y-3">
          {/* Address search — always visible */}
          <div className="flex gap-2 rounded-xl border border-violet-500/30 bg-neutral-900 p-3">
            <div className="relative flex-1">
              <input
                type="text"
                value={addressInput}
                onChange={(e) => { setAddressInput(e.target.value); setGeocodeError(""); }}
                onKeyDown={(e) => { if (e.key === "Enter") void geocodeAndAnalyze(); }}
                placeholder="Enter address (e.g. Ayala Ave, Makati)"
                className="w-full rounded-lg border border-white/10 bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-500 focus:border-violet-500/50 focus:outline-none"
              />
              {geocodeError && (
                <p className="absolute -bottom-5 left-0 text-[11px] text-red-400">{geocodeError}</p>
              )}
            </div>
            <button
              onClick={() => void geocodeAndAnalyze()}
              disabled={geocoding || !addressInput.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold disabled:opacity-40 hover:bg-violet-500 whitespace-nowrap"
            >
              {geocoding ? (
                <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent inline-block" /> Searching…</>
              ) : "🔎 Search"}
            </button>
          </div>

          {/* Mode + radius + actions */}
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-neutral-900 p-3">
            {/* Mode */}
            <div className="flex rounded-lg bg-neutral-800 p-0.5">
              {(["manual", "bestspots"] as const).map((m) => (
                <button key={m} onClick={() => setMode(m)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${mode === m ? "bg-violet-600 text-white" : "text-neutral-400 hover:text-white"}`}>
                  {m === "manual" ? "📍 Manual Pin" : "🔍 Find Best Spots"}
                </button>
              ))}
            </div>

            {/* Radius */}
            <div className="flex flex-1 min-w-[200px] items-center gap-3">
              <span className="shrink-0 text-sm text-neutral-400">Radius</span>
              <input type="range" min={500} max={10000} step={250} value={radiusM}
                onChange={(e) => { setRadiusM(Number(e.target.value)); setEstimate(null); setRankResult(null); }}
                className="flex-1 accent-violet-500" />
              <span className="w-14 shrink-0 text-right text-sm font-semibold text-violet-400">{radiusKm} km</span>
            </div>

            {/* Mall toggle */}
            <button
              onClick={() => setShowMalls((v) => !v)}
              disabled={mallsLoading}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                showMalls
                  ? "border-amber-500/50 bg-amber-500/15 text-amber-300"
                  : "border-white/10 bg-neutral-800 text-neutral-400 hover:text-white"
              }`}>
              🏬 {mallsLoading ? "Loading…" : showMalls ? "Hide Malls" : "Show Malls"}
            </button>

            {/* Action */}
            {mode === "manual" ? (
              <button onClick={runEstimate} disabled={!pinLatLng || estimating}
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold disabled:opacity-40 hover:bg-violet-500">
                {estimating ? "Estimating…" : "Estimate Population"}
              </button>
            ) : (
              <button onClick={runBestSpots} disabled={scanning}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold disabled:opacity-40 hover:bg-emerald-500">
                {scanning ? "Scanning NCR…" : "▶ Scan Metro Manila"}
              </button>
            )}
          </div>
        </div>

        {/* Map + Results */}
        <div className="flex gap-4 flex-col lg:flex-row">
          {/* Map */}
          <div className="relative min-w-0 flex-1" style={{ height: "560px" }}>
            {mode === "manual" && !pinLatLng && (
              <div className="absolute inset-x-0 top-8 z-10 flex justify-center pointer-events-none">
                <div className="rounded-lg bg-black/70 px-4 py-2 text-sm text-neutral-300 backdrop-blur-sm">
                  Click anywhere on the map to place a pin
                </div>
              </div>
            )}
            <div ref={mapRef} className="absolute inset-0 rounded-xl overflow-hidden border border-white/10" />
          </div>

          {/* Results panel */}
          <div className="w-full lg:w-80 shrink-0 flex flex-col gap-3">

            {/* Manual pin results */}
            {mode === "manual" && (
              <>
                {/* Rank result card — shown when address search ran */}
                {rankResult && (
                  <div className="rounded-xl border border-emerald-500/30 bg-neutral-900 p-4">
                    <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">Address Analysis</div>
                    <div className="flex items-end gap-3 mb-3">
                      <div>
                        <div className="text-[10px] text-neutral-500 mb-0.5">Population in range</div>
                        <div className="text-3xl font-bold text-violet-400">{fmt(rankResult.population)}</div>
                        <div className="text-xs text-neutral-500 mt-0.5">{radiusKm} km radius</div>
                      </div>
                      <div className="ml-auto text-right">
                        <div className="text-[10px] text-neutral-500 mb-0.5">NCR Rank</div>
                        <div className="text-4xl font-black text-emerald-400">#{rankResult.rank}</div>
                        <div className="text-[10px] text-neutral-500 mt-0.5">of {rankResult.total_candidates.toLocaleString()} points</div>
                      </div>
                    </div>
                    {/* Percentile bar */}
                    <div className="mb-3">
                      <div className="flex justify-between text-[10px] text-neutral-500 mb-1">
                        <span>Percentile</span>
                        <span className="font-semibold text-emerald-400">Top {(100 - rankResult.percentile).toFixed(1)}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-neutral-800 overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-emerald-500 transition-all duration-500"
                          style={{ width: `${Math.min(100, rankResult.percentile)}%` }} />
                      </div>
                      <div className="flex justify-between text-[10px] text-neutral-600 mt-0.5">
                        <span>Worst</span><span>Best</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1.5">
                      <span className="text-sm">🏬</span>
                      <span className="text-xs text-amber-300">{rankResult.nearest_mall}</span>
                      <span className="ml-auto text-xs text-neutral-500">{rankResult.nearest_mall_km} km</span>
                    </div>
                  </div>
                )}

                {pinLatLng && !rankResult && (
                  <div className="rounded-xl border border-white/10 bg-neutral-900 p-4">
                    <div className="text-xs text-neutral-500 mb-1">Selected location</div>
                    <div className="font-mono text-sm text-neutral-300">{pinLatLng.lat.toFixed(5)}, {pinLatLng.lng.toFixed(5)}</div>
                    <div className="mt-1 text-xs text-neutral-500">Circle area: {(Math.PI * (radiusM / 1000) ** 2).toFixed(2)} km²</div>
                  </div>
                )}
                {estimate && (
                  <div className="rounded-xl border border-violet-500/30 bg-neutral-900 p-4">
                    {!rankResult && (
                      <div className="mb-1 flex items-baseline gap-2">
                        <span className="text-3xl font-bold text-violet-400">{fmt(estimate.population)}</span>
                        <span className="text-sm text-neutral-400">people</span>
                      </div>
                    )}
                    <div className={`${rankResult ? "" : "mb-3"} flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1.5 ${rankResult ? "hidden" : ""}`}>
                      <span className="text-sm">🏬</span>
                      <span className="text-xs text-amber-300">{estimate.nearest_mall}</span>
                      <span className="ml-auto text-xs text-neutral-500">{estimate.nearest_mall_km} km</span>
                    </div>
                    <div className={rankResult ? "" : "mb-3 mt-3"}>
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">City Breakdown</div>
                      <div className="space-y-1.5">
                        {estimate.breakdown.map((b) => (
                          <div key={b.city} className="flex items-center gap-2">
                            <div className="flex-1">
                              <div className="flex justify-between text-xs">
                                <span className="text-neutral-300">{b.city}</span>
                                <span className="text-neutral-400">{fmt(b.covered)}</span>
                              </div>
                              <div className="mt-0.5 h-1 rounded-full bg-neutral-800 overflow-hidden">
                                <div className="h-full rounded-full bg-violet-500" style={{ width: `${Math.min(100, b.fraction_pct)}%` }} />
                              </div>
                            </div>
                            <span className="w-10 shrink-0 text-right text-[10px] text-neutral-500">{b.fraction_pct}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="mt-3 text-[10px] text-neutral-600">{estimate.note}</div>
                  </div>
                )}
                {!estimate && !pinLatLng && !rankResult && (
                  <div className="rounded-xl border border-white/10 bg-neutral-900 p-6 text-center">
                    <div className="text-3xl mb-2">📍</div>
                    <div className="text-sm text-neutral-400">Enter an address above or click the map to place a pin</div>
                  </div>
                )}
              </>
            )}

            {/* Best spots results */}
            {mode === "bestspots" && (
              <>
                {scanning && (
                  <div className="rounded-xl border border-white/10 bg-neutral-900 p-6 text-center">
                    <div className="mb-3 h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent mx-auto" />
                    <div className="text-sm text-neutral-400">Scanning Metro Manila…</div>
                  </div>
                )}
                {spots.length > 0 && (
                  <div className="rounded-xl border border-white/10 bg-neutral-900 overflow-hidden flex flex-col" style={{ maxHeight: "520px" }}>
                    <div className="border-b border-white/10 px-4 py-3 shrink-0">
                      <div className="text-sm font-semibold text-white">Top {spots.length} Locations for ZEN</div>
                      <div className="text-xs text-neutral-500">Radius: {radiusKm} km · PSA 2020 Census</div>
                    </div>
                    <div className="overflow-y-auto divide-y divide-white/5">
                      {spots.map((s, i) => (
                        <div key={i}
                          className="flex items-start gap-3 px-4 py-2.5 hover:bg-white/5 cursor-pointer transition-colors"
                          onClick={() => { if (mapInstanceRef.current) (mapInstanceRef.current as import("leaflet").Map).setView([s.lat, s.lng], 14); }}>
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white mt-0.5"
                            style={{ backgroundColor: SPOT_COLORS[i % SPOT_COLORS.length] }}>
                            {s.rank}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-1.5">
                              <span className="text-sm font-medium text-white">{s.area}</span>
                              <span className="text-lg font-bold text-emerald-400 ml-auto">{fmt(s.population)}</span>
                            </div>
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className="text-[10px]">🏬</span>
                              <span className="text-[10px] text-neutral-500 truncate">{s.nearest_mall}</span>
                              <span className="text-[10px] text-neutral-600 shrink-0">{s.mall_dist_km}km</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {!scanning && spots.length === 0 && (
                  <div className="rounded-xl border border-white/10 bg-neutral-900 p-6 text-center">
                    <div className="text-3xl mb-2">🔍</div>
                    <div className="text-sm text-neutral-400">Set radius and click <span className="text-emerald-400 font-medium">Scan Metro Manila</span></div>
                  </div>
                )}
              </>
            )}

            {/* Mall legend */}
            {showMalls && malls.length > 0 && (
              <div className="rounded-xl border border-amber-500/20 bg-neutral-900 p-3">
                <div className="text-xs font-medium text-amber-400 mb-2">🏬 Mall Brands</div>
                <div className="grid grid-cols-2 gap-1">
                  {Object.entries(BRAND_COLORS).map(([brand, color]) => (
                    <div key={brand} className="flex items-center gap-1.5">
                      <div className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: color }} />
                      <span className="text-[11px] text-neutral-400">{brand}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-[10px] text-neutral-600">{malls.length} malls shown</div>
              </div>
            )}

            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
              <div className="text-xs text-amber-400/80">
                ⚠ Estimates use PSA 2020 Census with uniform city-wide density.
                Actual density varies by barangay. Use as reference only.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

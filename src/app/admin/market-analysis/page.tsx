"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { getAuth, getAuthHeaders } from "@/lib/auth";

type SpotResult = {
  rank: number;
  lat: number;
  lng: number;
  population: number;
  area: string;
};

type BreakdownItem = {
  city: string;
  covered: number;
  fraction_pct: number;
};

type EstimateResult = {
  population: number;
  area_km2: number;
  breakdown: BreakdownItem[];
  note: string;
};

const COLORS = [
  "#ef4444","#f97316","#eab308","#22c55e","#06b6d4",
  "#8b5cf6","#ec4899","#14b8a6","#f59e0b","#6366f1",
];

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

  const [mode, setMode] = useState<"manual" | "bestspots">("manual");
  const [radiusM, setRadiusM] = useState(3000);
  const [pinLatLng, setPinLatLng] = useState<{ lat: number; lng: number } | null>(null);
  const [estimate, setEstimate] = useState<EstimateResult | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [spots, setSpots] = useState<SpotResult[]>([]);
  const [scanning, setScanning] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  // Initialize Leaflet map
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);

    import("leaflet").then((L) => {
      if (!mapRef.current || mapInstanceRef.current) return;
      leafletRef.current = L;

      // Fix default icon paths
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
      // Force layout recalculation so tiles render correctly
      setTimeout(() => {
        map.invalidateSize();
      }, 100);
      setMapReady(true);
    });

    return () => {
      if (mapInstanceRef.current) {
          (mapInstanceRef.current as import("leaflet").Map).remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update circle when pin or radius changes
  useEffect(() => {
    if (!mapReady || !leafletRef.current || !mapInstanceRef.current) return;
    const L = leafletRef.current as typeof import("leaflet");
    const map = mapInstanceRef.current as import("leaflet").Map;

    if (circleRef.current) {
      (circleRef.current as import("leaflet").Circle).remove();
      circleRef.current = null;
    }

    if (pinLatLng) {
      const circle = L.circle([pinLatLng.lat, pinLatLng.lng], {
        radius: radiusM,
        color: "#8b5cf6",
        fillColor: "#8b5cf6",
        fillOpacity: 0.12,
        weight: 2,
      }).addTo(map);
      circleRef.current = circle;
    }
  }, [pinLatLng, radiusM, mapReady]);

  // Click handler to place pin (manual mode)
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current as import("leaflet").Map;

    const L = leafletRef.current as typeof import("leaflet");

    const onClick = (e: import("leaflet").LeafletMouseEvent) => {
      if (mode !== "manual") return;
      const { lat, lng } = e.latlng;

      if (pinRef.current) {
        (pinRef.current as import("leaflet").Marker).remove();
        pinRef.current = null;
      }

      const marker = L.marker([lat, lng]).addTo(map);
      pinRef.current = marker;
      setPinLatLng({ lat, lng });
      setEstimate(null);
    };

    map.on("click", onClick);
    return () => { map.off("click", onClick); };
  }, [mapReady, mode]);

  // Clear spot markers helper
  const clearSpotMarkers = useCallback(() => {
    spotMarkersRef.current.forEach((m) => (m as import("leaflet").Marker).remove());
    spotMarkersRef.current = [];
  }, []);

  // Plot best-spot markers on map
  const plotSpots = useCallback((spotsData: SpotResult[]) => {
    if (!mapReady || !leafletRef.current || !mapInstanceRef.current) return;
    const L = leafletRef.current as typeof import("leaflet");
    const map = mapInstanceRef.current as import("leaflet").Map;

    clearSpotMarkers();

    spotsData.forEach((s, i) => {
      const color = COLORS[i % COLORS.length];
      const icon = L.divIcon({
        html: `<div style="
          background:${color};color:#fff;border-radius:50%;
          width:28px;height:28px;display:flex;align-items:center;justify-content:center;
          font-weight:700;font-size:13px;border:2px solid #fff;
          box-shadow:0 2px 6px rgba(0,0,0,0.4);
        ">${s.rank}</div>`,
        className: "",
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const circle = L.circle([s.lat, s.lng], {
        radius: radiusM,
        color,
        fillColor: color,
        fillOpacity: 0.08,
        weight: 1.5,
        dashArray: "4 4",
      }).addTo(map);

      const marker = L.marker([s.lat, s.lng], { icon })
        .bindPopup(`<b>#${s.rank} ${s.area}</b><br>${fmt(s.population)} people`)
        .addTo(map);

      spotMarkersRef.current.push(circle as unknown, marker as unknown);
    });
  }, [mapReady, radiusM, clearSpotMarkers]);

  const runEstimate = useCallback(async () => {
    if (!pinLatLng) return;
    setEstimating(true);
    try {
      const auth = getAuth();
      const res = await fetch("/api/admin/market-analysis/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(getAuthHeaders(auth) ?? {}) },
        body: JSON.stringify({ lat: pinLatLng.lat, lng: pinLatLng.lng, radius_m: radiusM }),
      });
      if (!res.ok) throw new Error(await res.text());
      setEstimate(await res.json());
    } catch (e) {
      alert("Estimation failed: " + e);
    } finally {
      setEstimating(false);
    }
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
        body: JSON.stringify({ radius_m: radiusM, top_n: 10 }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setSpots(data.spots);
      plotSpots(data.spots);
    } catch (e) {
      alert("Scan failed: " + e);
    } finally {
      setScanning(false);
    }
  }, [radiusM, clearSpotMarkers, plotSpots]);

  // When switching to manual mode, clear spot markers
  useEffect(() => {
    if (mode === "manual") {
      clearSpotMarkers();
      setSpots([]);
    }
  }, [mode, clearSpotMarkers]);

  const radiusKm = (radiusM / 1000).toFixed(1);

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      {/* Header */}
      <div className="border-b border-white/10 bg-neutral-900 px-4 py-4">
        <div className="mx-auto max-w-6xl">
          <h1 className="text-xl font-bold tracking-tight text-white">
            Metro Manila Market Analysis
          </h1>
          <p className="mt-0.5 text-sm text-neutral-400">
            Population coverage analysis for new store location planning
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6">
        {/* Controls row */}
        <div className="mb-4 flex flex-wrap items-center gap-4 rounded-xl border border-white/10 bg-neutral-900 p-4">
          {/* Mode toggle */}
          <div className="flex rounded-lg bg-neutral-800 p-0.5">
            {(["manual", "bestspots"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  mode === m
                    ? "bg-violet-600 text-white"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                {m === "manual" ? "📍 Manual Pin" : "🔍 Find Best Spots"}
              </button>
            ))}
          </div>

          {/* Radius slider */}
          <div className="flex flex-1 items-center gap-3 min-w-[220px]">
            <span className="shrink-0 text-sm text-neutral-400">Delivery Radius</span>
            <input
              type="range"
              min={500}
              max={10000}
              step={250}
              value={radiusM}
              onChange={(e) => {
                setRadiusM(Number(e.target.value));
                setEstimate(null);
              }}
              className="flex-1 accent-violet-500"
            />
            <span className="w-14 shrink-0 text-right text-sm font-semibold text-violet-400">
              {radiusKm} km
            </span>
          </div>

          {/* Action button */}
          {mode === "manual" ? (
            <button
              onClick={runEstimate}
              disabled={!pinLatLng || estimating}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold disabled:opacity-40 hover:bg-violet-500"
            >
              {estimating ? "Estimating…" : "Estimate Population"}
            </button>
          ) : (
            <button
              onClick={runBestSpots}
              disabled={scanning}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold disabled:opacity-40 hover:bg-emerald-500"
            >
              {scanning ? "Scanning NCR…" : "▶ Scan Metro Manila"}
            </button>
          )}
        </div>

        {/* Map + Results side by side */}
        <div className="flex gap-4 flex-col lg:flex-row">
          {/* Map */}
          <div className="relative flex-1">
            {mode === "manual" && !pinLatLng && (
              <div className="absolute inset-0 z-10 flex items-start justify-center pt-8 pointer-events-none">
                <div className="rounded-lg bg-black/70 px-4 py-2 text-sm text-neutral-300 backdrop-blur-sm">
                  Click anywhere on the map to place a pin
                </div>
              </div>
            )}
            <div
              ref={mapRef}
              className="rounded-xl overflow-hidden border border-white/10 w-full"
              style={{ height: "520px", minHeight: "520px" }}
            />
          </div>

          {/* Results panel */}
          <div className="w-full lg:w-80 shrink-0 space-y-3">
            {mode === "manual" && (
              <>
                {pinLatLng && (
                  <div className="rounded-xl border border-white/10 bg-neutral-900 p-4">
                    <div className="text-xs text-neutral-500 mb-1">Selected location</div>
                    <div className="font-mono text-sm text-neutral-300">
                      {pinLatLng.lat.toFixed(5)}, {pinLatLng.lng.toFixed(5)}
                    </div>
                    <div className="mt-1 text-xs text-neutral-500">
                      Circle area: {(Math.PI * (radiusM / 1000) ** 2).toFixed(2)} km²
                    </div>
                  </div>
                )}

                {estimate && (
                  <div className="rounded-xl border border-violet-500/30 bg-neutral-900 p-4">
                    <div className="mb-3 flex items-baseline gap-2">
                      <span className="text-3xl font-bold text-violet-400">
                        {fmt(estimate.population)}
                      </span>
                      <span className="text-sm text-neutral-400">estimated people</span>
                    </div>
                    <div className="text-xs text-neutral-500 mb-3">{estimate.note}</div>
                    <div className="space-y-1.5">
                      {estimate.breakdown.map((b) => (
                        <div key={b.city} className="flex items-center gap-2">
                          <div className="flex-1">
                            <div className="flex justify-between text-xs">
                              <span className="text-neutral-300">{b.city}</span>
                              <span className="text-neutral-400">{fmt(b.covered)}</span>
                            </div>
                            <div className="mt-0.5 h-1 rounded-full bg-neutral-800 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-violet-500"
                                style={{ width: `${Math.min(100, b.fraction_pct)}%` }}
                              />
                            </div>
                          </div>
                          <span className="w-10 shrink-0 text-right text-[10px] text-neutral-500">
                            {b.fraction_pct}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!estimate && !pinLatLng && (
                  <div className="rounded-xl border border-white/10 bg-neutral-900 p-6 text-center">
                    <div className="text-3xl mb-2">📍</div>
                    <div className="text-sm text-neutral-400">
                      Click the map to select a potential store location
                    </div>
                  </div>
                )}
              </>
            )}

            {mode === "bestspots" && (
              <>
                {scanning && (
                  <div className="rounded-xl border border-white/10 bg-neutral-900 p-6 text-center">
                    <div className="mb-3 h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent mx-auto" />
                    <div className="text-sm text-neutral-400">
                      Scanning {Math.round((14.85 - 14.30) / 0.0036) * Math.round((121.33 - 120.88) / 0.0045)} locations…
                    </div>
                  </div>
                )}

                {spots.length > 0 && (
                  <div className="rounded-xl border border-white/10 bg-neutral-900 overflow-hidden">
                    <div className="border-b border-white/10 px-4 py-3">
                      <div className="text-sm font-semibold text-white">Top 10 Locations</div>
                      <div className="text-xs text-neutral-500">
                        Radius: {radiusKm} km · Based on PSA 2020 Census
                      </div>
                    </div>
                    <div className="divide-y divide-white/5">
                      {spots.map((s, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 cursor-pointer transition-colors"
                          onClick={() => {
                            if (mapInstanceRef.current) {
                              (mapInstanceRef.current as import("leaflet").Map).setView(
                                [s.lat, s.lng], 13
                              );
                            }
                          }}
                        >
                          <div
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                            style={{ backgroundColor: COLORS[i % COLORS.length] }}
                          >
                            {s.rank}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-white truncate">
                              {s.area} area
                            </div>
                            <div className="text-xs text-neutral-500">
                              {s.lat.toFixed(4)}, {s.lng.toFixed(4)}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-sm font-bold text-emerald-400">
                              {fmt(s.population)}
                            </div>
                            <div className="text-[10px] text-neutral-500">people</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!scanning && spots.length === 0 && (
                  <div className="rounded-xl border border-white/10 bg-neutral-900 p-6 text-center">
                    <div className="text-3xl mb-2">🔍</div>
                    <div className="text-sm text-neutral-400">
                      Set the delivery radius and click{" "}
                      <span className="text-emerald-400 font-medium">Scan Metro Manila</span>{" "}
                      to find the best coverage locations
                    </div>
                  </div>
                )}
              </>
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

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, Shuffle, SkipBack, SkipForward, Volume2, VolumeX, Repeat } from "lucide-react";

type Track = {
  id: number;
  title: string;
  subtitle: string;
  file: string;
  accent: string;       // Tailwind gradient (bg-gradient-to-br ...)
  accentHex: string;    // for canvas / glow
  glyph: string;        // big decorative character
};

const TRACKS: Track[] = [
  {
    id: 1,
    title: "ZEN Style",
    subtitle: "Sushi ZEN",
    file: "/music/sushi-zen-style.mp3",
    accent: "from-pink-400 via-rose-500 to-red-600",
    accentHex: "#ec4899",
    glyph: "粋",
  },
  {
    id: 2,
    title: "ZEN Anthem",
    subtitle: "Sushi ZEN",
    file: "/music/sushi-zen-anthem.mp3",
    accent: "from-violet-500 via-indigo-600 to-blue-700",
    accentHex: "#7c3aed",
    glyph: "禅",
  },
  {
    id: 3,
    title: "ZEN Slay",
    subtitle: "Sushi ZEN",
    file: "/music/sushi-zen-slay.mp3",
    accent: "from-rose-500 via-pink-600 to-fuchsia-700",
    accentHex: "#e11d48",
    glyph: "斬",
  },
  {
    id: 4,
    title: "ZEN Soul",
    subtitle: "Sushi ZEN",
    file: "/music/sushi-zen-soul.mp3",
    accent: "from-emerald-400 via-teal-500 to-cyan-700",
    accentHex: "#059669",
    glyph: "魂",
  },
  {
    id: 5,
    title: "Heart of ZEN",
    subtitle: "Sushi ZEN",
    file: "/music/heart-of-zen.mp3",
    accent: "from-amber-400 via-orange-500 to-red-600",
    accentHex: "#f59e0b",
    glyph: "心",
  },
  {
    id: 6,
    title: "ZEN Groove",
    subtitle: "Sushi ZEN",
    file: "/music/sushi-zen-groove.mp3",
    accent: "from-lime-400 via-green-500 to-emerald-700",
    accentHex: "#84cc16",
    glyph: "律",
  },
  {
    id: 7,
    title: "ZEN Gorilla",
    subtitle: "Sushi ZEN",
    file: "/music/sushi-zen-gorilla.mp3",
    accent: "from-yellow-400 via-amber-500 to-orange-600",
    accentHex: "#eab308",
    glyph: "猿",
  },
  {
    id: 8,
    title: "Rock'n Vibes",
    subtitle: "Sushi ZEN",
    file: "/music/sushi-zen-rocknvibes.mp3",
    accent: "from-red-500 via-orange-600 to-yellow-500",
    accentHex: "#ef4444",
    glyph: "轟",
  },
  {
    id: 9,
    title: "ZEN Metal",
    subtitle: "Sushi ZEN",
    file: "/music/zen-metal.mp3",
    accent: "from-zinc-300 via-slate-500 to-gray-800",
    accentHex: "#71717a",
    glyph: "鋼",
  },
  {
    id: 10,
    title: "We Are ZEN",
    subtitle: "Sushi ZEN",
    file: "/music/we-are-zen.mp3",
    accent: "from-sky-400 via-blue-500 to-indigo-600",
    accentHex: "#0ea5e9",
    glyph: "和",
  },
  {
    id: 11,
    title: "ZEN Party",
    subtitle: "Sushi ZEN",
    file: "/music/sushi-zen-party.mp3",
    accent: "from-fuchsia-400 via-pink-500 to-rose-600",
    accentHex: "#d946ef",
    glyph: "祭",
  },
  {
    id: 12,
    title: "ZEN Hawaiian",
    subtitle: "Sushi ZEN",
    file: "/music/sushi-zen-hawaiian.mp3",
    accent: "from-cyan-400 via-teal-400 to-emerald-500",
    accentHex: "#22d3ee",
    glyph: "浜",
  },
  {
    id: 13,
    title: "ZEN Memories",
    subtitle: "Sushi ZEN",
    file: "/music/sushi-zen-memories.mp3",
    accent: "from-purple-400 via-violet-500 to-indigo-600",
    accentHex: "#a855f7",
    glyph: "想",
  },
  {
    id: 14,
    title: "ZEN Midnight",
    subtitle: "Sushi ZEN",
    file: "/music/sushi-zen-midnight.mp3",
    accent: "from-slate-400 via-blue-700 to-indigo-900",
    accentHex: "#3730a3",
    glyph: "夜",
  },
  {
    id: 15,
    title: "ZEN ZA WARUDO",
    subtitle: "Sushi ZEN",
    file: "/music/zen-za-warudo.mp3",
    accent: "from-cyan-300 via-blue-500 to-violet-800",
    accentHex: "#6d28d9",
    glyph: "界",
  },
  {
    id: 16,
    title: "ZEN SHOGUN MODE",
    subtitle: "Sushi ZEN",
    file: "/music/zen-shogun-mode.mp3",
    accent: "from-red-900 via-red-700 to-orange-500",
    accentHex: "#b91c1c",
    glyph: "将",
  },
  {
    id: 17,
    title: "ZEN Night",
    subtitle: "Sushi ZEN",
    file: "/music/zen-night.mp3",
    accent: "from-indigo-900 via-purple-800 to-violet-600",
    accentHex: "#4c1d95",
    glyph: "宵",
  },
  {
    id: 18,
    title: "ZEN Days",
    subtitle: "Sushi ZEN",
    file: "/music/zen-days.mp3",
    accent: "from-sky-400 via-cyan-300 to-emerald-400",
    accentHex: "#0891b2",
    glyph: "陽",
  },
  {
    id: 19,
    title: "ZEN Jazzy Night",
    subtitle: "Sushi ZEN",
    file: "/music/zen-jazzy-night.mp3",
    accent: "from-amber-400 via-orange-500 to-yellow-700",
    accentHex: "#d97706",
    glyph: "爵",
  },
];

function fmt(sec: number) {
  if (!isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/* ── Animated album art ─────────────────────────────────────── */
function AlbumArt({ track, playing }: { track: Track; playing: boolean }) {
  const angle = useRef(0);
  const rafRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const SIZE = canvas.width;
    const cx = SIZE / 2;

    const draw = () => {
      ctx.clearRect(0, 0, SIZE, SIZE);

      // Outer glow ring
      const glow = ctx.createRadialGradient(cx, cx, cx * 0.55, cx, cx, cx * 0.98);
      glow.addColorStop(0, `${track.accentHex}00`);
      glow.addColorStop(0.7, `${track.accentHex}22`);
      glow.addColorStop(1, `${track.accentHex}55`);
      ctx.beginPath();
      ctx.arc(cx, cx, cx * 0.97, 0, Math.PI * 2);
      ctx.fillStyle = glow;
      ctx.fill();

      // Disc base
      ctx.save();
      ctx.translate(cx, cx);
      ctx.rotate(angle.current);

      const grad = ctx.createLinearGradient(-cx, -cx, cx, cx);
      grad.addColorStop(0, `${track.accentHex}cc`);
      grad.addColorStop(1, "#0d0d0d");
      ctx.beginPath();
      ctx.arc(0, 0, cx * 0.88, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // Vinyl grooves
      for (let i = 0; i < 6; i++) {
        const r = cx * (0.35 + i * 0.09);
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255,255,255,0.04)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Sheen arc
      ctx.beginPath();
      ctx.arc(0, 0, cx * 0.88, -Math.PI * 0.6, -Math.PI * 0.1);
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = cx * 0.18;
      ctx.stroke();

      ctx.restore();

      // Center hub
      const hub = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx * 0.18);
      hub.addColorStop(0, "#2a2a2a");
      hub.addColorStop(1, "#111");
      ctx.beginPath();
      ctx.arc(cx, cx, cx * 0.18, 0, Math.PI * 2);
      ctx.fillStyle = hub;
      ctx.fill();

      // Center dot
      ctx.beginPath();
      ctx.arc(cx, cx, cx * 0.05, 0, Math.PI * 2);
      ctx.fillStyle = track.accentHex + "cc";
      ctx.fill();

      if (playing) angle.current += 0.006;
      rafRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [track, playing]);

  return (
    <canvas
      ref={canvasRef}
      width={280}
      height={280}
      className="drop-shadow-2xl"
      style={{ borderRadius: "50%" }}
    />
  );
}

/* ── Waveform bars ──────────────────────────────────────────── */
function Bars({ playing, accent }: { playing: boolean; accent: string }) {
  const BARS = 28;
  return (
    <div className="flex items-end justify-center gap-[2px]" style={{ height: 32 }}>
      {Array.from({ length: BARS }).map((_, i) => (
        <span
          key={i}
          className={`w-[3px] rounded-full bg-gradient-to-t ${accent}`}
          style={{
            height: playing ? undefined : "3px",
            minHeight: 3,
            opacity: playing ? 0.85 : 0.25,
            animation: playing
              ? `bar${(i % 5) + 1} ${0.55 + (i % 7) * 0.08}s ease-in-out infinite alternate`
              : "none",
          }}
        />
      ))}
    </div>
  );
}

/* ── Seek / Volume slider ───────────────────────────────────── */
function Slider({
  value,
  max,
  onChange,
  accent,
}: {
  value: number;
  max: number;
  onChange: (v: number) => void;
  accent: string;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="relative flex h-1.5 w-full cursor-pointer items-center rounded-full bg-white/10">
      <div
        className={`pointer-events-none absolute left-0 h-full rounded-full bg-gradient-to-r ${accent}`}
        style={{ width: `${pct}%`, transition: "width 0.05s linear" }}
      />
      <input
        type="range"
        min={0}
        max={max || 100}
        step={max < 2 ? 0.01 : 0.5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </div>
  );
}

/* ── Track row ──────────────────────────────────────────────── */
function TrackRow({
  track,
  active,
  playing,
  onClick,
}: {
  track: Track;
  active: boolean;
  playing: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "group flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-all duration-200 active:scale-[0.98]",
        active
          ? "bg-white/10 ring-1 ring-white/20"
          : "hover:bg-white/6",
      ].join(" ")}
    >
      {/* mini disc */}
      <div
        className={`relative flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${track.accent} text-xl font-bold text-white/90 shadow-lg`}
        style={{ fontFamily: "serif" }}
      >
        {track.glyph}
        {active && (
          <span className="absolute inset-0 animate-ping rounded-full opacity-20"
            style={{ background: track.accentHex }} />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className={`truncate text-sm font-semibold ${active ? "text-white" : "text-neutral-200"}`}>
          {track.title}
        </div>
        <div className="text-xs text-neutral-500">{track.subtitle}</div>
      </div>

      {active ? (
        <div className="flex items-end gap-[2px]" style={{ height: 18 }}>
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={`w-[3px] rounded-full bg-gradient-to-t ${track.accent}`}
              style={{
                height: playing ? undefined : "3px",
                minHeight: 3,
                animation: playing
                  ? `bar${(i % 5) + 1} ${0.5 + i * 0.1}s ease-in-out infinite alternate`
                  : "none",
              }}
            />
          ))}
        </div>
      ) : (
        <span className="text-xs text-neutral-600 tabular-nums">
          #{track.id}
        </span>
      )}
    </button>
  );
}

/* ── Main page ──────────────────────────────────────────────── */
export default function ZenMusicPage() {
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [muted, setMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const track = TRACKS[idx];

  /* load new track */
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;

    // Do NOT call a.load() here — setting src already triggers the browser's
    // media-resource-fetch algorithm. Calling load() right before play() causes
    // the play() Promise to be rejected with AbortError in Chrome/Safari, which
    // fires our catch handler and flips playing→false, delaying playback ~10s.
    a.src = track.file;
    setCurrentTime(0);
    setDuration(0);

    if (playing) {
      // Wait for enough data before playing so play() never rejects with NotAllowedError
      const onCanPlay = () => {
        a.play().catch(() => setPlaying(false));
      };
      a.addEventListener("canplay", onCanPlay, { once: true });
      return () => a.removeEventListener("canplay", onCanPlay);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  /* play / pause */
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      // If src is already loaded (e.g. paused mid-track) play immediately;
      // otherwise the canplay listener in the idx effect will handle it.
      if (a.readyState >= 3) {
        a.play().catch(() => setPlaying(false));
      }
    } else {
      a.pause();
    }
  }, [playing]);

  /* volume */
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.volume = volume;
    a.muted = muted;
  }, [volume, muted]);

  const onTimeUpdate = useCallback(() => {
    const a = audioRef.current;
    if (a) setCurrentTime(a.currentTime);
  }, []);
  const onLoadedMetadata = useCallback(() => {
    const a = audioRef.current;
    if (a) setDuration(a.duration);
  }, []);
  const onEnded = useCallback(() => {
    if (repeat) {
      const a = audioRef.current;
      if (a) { a.currentTime = 0; a.play().catch(() => {}); }
      return;
    }
    if (shuffle) {
      let next: number;
      do { next = Math.floor(Math.random() * TRACKS.length); } while (next === idx && TRACKS.length > 1);
      setIdx(next);
    } else {
      setIdx((i) => (i + 1) % TRACKS.length);
    }
    setPlaying(true);
  }, [idx, shuffle, repeat]);

  const prev = () => {
    if (currentTime > 3) {
      const a = audioRef.current;
      if (a) { a.currentTime = 0; setCurrentTime(0); }
      return;
    }
    setIdx((i) => (i - 1 + TRACKS.length) % TRACKS.length);
    setPlaying(true);
  };
  const next = () => {
    setIdx((i) => shuffle
      ? (() => { let n; do { n = Math.floor(Math.random() * TRACKS.length); } while (n === i && TRACKS.length > 1); return n; })()
      : (i + 1) % TRACKS.length
    );
    setPlaying(true);
  };

  return (
    <>
      <style>{`
        @keyframes bar1 { from{height:3px} to{height:22px} }
        @keyframes bar2 { from{height:6px} to{height:16px} }
        @keyframes bar3 { from{height:4px} to{height:26px} }
        @keyframes bar4 { from{height:8px} to{height:14px} }
        @keyframes bar5 { from{height:5px} to{height:20px} }

        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 14px; height: 14px;
          border-radius: 50%;
          background: white;
          cursor: pointer;
          box-shadow: 0 0 6px rgba(0,0,0,0.5);
        }
        input[type=range]:focus { outline: none; }
      `}</style>

      <audio
        ref={audioRef}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onLoadedMetadata}
        onEnded={onEnded}
        preload="auto"
      />

      {/* full-page dark canvas */}
      <div
        className="relative flex min-h-screen flex-col overflow-hidden bg-[#080808] text-white"
        style={{ fontFamily: "'SF Pro Display', 'Helvetica Neue', sans-serif" }}
      >
        {/* ambient background glow */}
        <div
          className="pointer-events-none absolute inset-0 opacity-20 blur-[120px] transition-all duration-1000"
          style={{
            background: `radial-gradient(ellipse at 40% 20%, ${track.accentHex}88, transparent 60%),
                         radial-gradient(ellipse at 80% 80%, ${track.accentHex}44, transparent 55%)`,
          }}
        />

        {/* ── Header ── */}
        <header className="relative flex items-center justify-between px-6 pt-safe pt-6 pb-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/30">Now Playing</p>
            <h1 className="text-base font-bold tracking-tight text-white/90">ZEN Music</h1>
          </div>
          <div className="flex gap-1.5">
            {TRACKS.map((_, i) => (
              <button key={i} onClick={() => { setIdx(i); setPlaying(true); }}>
                <span
                  className="block rounded-full transition-all duration-300"
                  style={{
                    width: i === idx ? 20 : 6,
                    height: 6,
                    background: i === idx ? track.accentHex : "rgba(255,255,255,0.2)",
                  }}
                />
              </button>
            ))}
          </div>
        </header>

        {/* ── Album art ── */}
        <div className="relative flex flex-1 flex-col items-center px-8 pt-6 pb-2">
          {/* disc */}
          <div
            className="relative mb-6"
            style={{
              filter: playing
                ? `drop-shadow(0 0 32px ${track.accentHex}88)`
                : `drop-shadow(0 8px 24px rgba(0,0,0,0.7))`,
              transition: "filter 0.6s ease",
            }}
          >
            <AlbumArt track={track} playing={playing} />
          </div>

          {/* Waveform */}
          <div className="mb-5 w-full">
            <Bars playing={playing} accent={track.accent} />
          </div>

          {/* Track info */}
          <div className="mb-6 w-full text-center">
            <h2 className="text-2xl font-bold tracking-tight">{track.title}</h2>
            <p className="mt-0.5 text-sm font-medium text-white/40">{track.subtitle} Original</p>
          </div>

          {/* Seek bar */}
          <div className="mb-1.5 w-full">
            <Slider
              value={currentTime}
              max={duration}
              onChange={(v) => {
                const a = audioRef.current;
                if (a) { a.currentTime = v; setCurrentTime(v); }
              }}
              accent={track.accent}
            />
          </div>
          <div className="mb-6 flex w-full justify-between text-[11px] font-medium text-white/30 tabular-nums">
            <span>{fmt(currentTime)}</span>
            <span>{fmt(duration)}</span>
          </div>

          {/* Controls */}
          <div className="mb-6 flex w-full items-center justify-between px-2">
            {/* Shuffle */}
            <button
              onClick={() => setShuffle((s) => !s)}
              className={`flex h-10 w-10 items-center justify-center rounded-full transition ${shuffle ? "text-white" : "text-white/25 hover:text-white/50"}`}
            >
              <Shuffle className="h-5 w-5" />
            </button>

            {/* Prev */}
            <button
              onClick={prev}
              className="flex h-12 w-12 items-center justify-center rounded-full text-white/70 transition hover:text-white active:scale-90"
            >
              <SkipBack className="h-6 w-6 fill-current" />
            </button>

            {/* Play / Pause */}
            <button
              onClick={() => setPlaying((p) => !p)}
              className="relative flex h-20 w-20 items-center justify-center rounded-full shadow-2xl transition active:scale-95"
              style={{
                background: `linear-gradient(135deg, ${track.accentHex}dd, ${track.accentHex}88)`,
                boxShadow: `0 0 ${playing ? "32px" : "16px"} ${track.accentHex}66`,
              }}
            >
              {playing
                ? <Pause className="h-8 w-8 fill-white text-white" />
                : <Play className="h-8 w-8 translate-x-0.5 fill-white text-white" />
              }
            </button>

            {/* Next */}
            <button
              onClick={next}
              className="flex h-12 w-12 items-center justify-center rounded-full text-white/70 transition hover:text-white active:scale-90"
            >
              <SkipForward className="h-6 w-6 fill-current" />
            </button>

            {/* Repeat */}
            <button
              onClick={() => setRepeat((r) => !r)}
              className={`flex h-10 w-10 items-center justify-center rounded-full transition ${repeat ? "text-white" : "text-white/25 hover:text-white/50"}`}
            >
              <Repeat className="h-5 w-5" />
            </button>
          </div>

          {/* Volume */}
          <div className="flex w-full items-center gap-3 px-1">
            <button
              onClick={() => setMuted((m) => !m)}
              className="text-white/30 transition hover:text-white/70"
            >
              {muted || volume === 0
                ? <VolumeX className="h-4 w-4" />
                : <Volume2 className="h-4 w-4" />
              }
            </button>
            <Slider
              value={muted ? 0 : volume}
              max={1}
              onChange={(v) => { setVolume(v); setMuted(false); }}
              accent={track.accent}
            />
          </div>
        </div>

        {/* ── Playlist ── */}
        <div className="relative mt-4 rounded-t-3xl border-t border-white/8 bg-white/[0.03] px-4 pb-8 pt-5 backdrop-blur-xl">
          <p className="mb-3 px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/25">
            Playlist · {TRACKS.length} tracks
          </p>
          <div className="flex flex-col gap-1">
            {TRACKS.map((t, i) => (
              <TrackRow
                key={t.id}
                track={t}
                active={i === idx}
                playing={playing}
                onClick={() => {
                  if (i === idx) { setPlaying((p) => !p); }
                  else { setIdx(i); setPlaying(true); }
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

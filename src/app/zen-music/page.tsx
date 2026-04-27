"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";

type Track = {
  id: number;
  title: string;
  file: string;
  emoji: string;
  color: string;
};

const TRACKS: Track[] = [
  {
    id: 1,
    title: "Sushi ZEN Anthem",
    file: "/music/sushi-zen-anthem.mp3",
    emoji: "🎌",
    color: "from-violet-600 to-indigo-800",
  },
  {
    id: 2,
    title: "Sushi ZEN Slay",
    file: "/music/sushi-zen-slay.mp3",
    emoji: "⚡",
    color: "from-rose-600 to-pink-800",
  },
  {
    id: 3,
    title: "Sushi ZEN Soul",
    file: "/music/sushi-zen-soul.mp3",
    emoji: "🌸",
    color: "from-emerald-600 to-teal-800",
  },
  {
    id: 4,
    title: "Heart of ZEN",
    file: "/music/heart-of-zen.mp3",
    emoji: "❤️",
    color: "from-amber-600 to-orange-800",
  },
];

function fmtTime(sec: number) {
  if (!isFinite(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function WaveBar({ playing, delay }: { playing: boolean; delay: string }) {
  return (
    <span
      className="inline-block w-1 rounded-full bg-white/80"
      style={{
        height: playing ? undefined : "4px",
        animation: playing ? `waveAnim 0.8s ease-in-out infinite alternate` : "none",
        animationDelay: delay,
        minHeight: "4px",
        maxHeight: "20px",
        transition: "height 0.2s",
      }}
    />
  );
}

export default function ZenMusicPage() {
  const [trackIdx, setTrackIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const track = TRACKS[trackIdx];

  // Load new track
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.src = track.file;
    audio.load();
    setCurrentTime(0);
    setDuration(0);
    if (playing) {
      audio.play().catch(() => setPlaying(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackIdx]);

  // Sync playing state
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.play().catch(() => setPlaying(false));
    } else {
      audio.pause();
    }
  }, [playing]);

  // Volume/mute sync
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = muted;
  }, [volume, muted]);

  const onTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (audio) setCurrentTime(audio.currentTime);
  }, []);

  const onLoadedMetadata = useCallback(() => {
    const audio = audioRef.current;
    if (audio) setDuration(audio.duration);
  }, []);

  const onEnded = useCallback(() => {
    setTrackIdx((i) => (i + 1) % TRACKS.length);
    setPlaying(true);
  }, []);

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const t = Number(e.target.value);
    audio.currentTime = t;
    setCurrentTime(t);
  };

  const prevTrack = () => setTrackIdx((i) => (i - 1 + TRACKS.length) % TRACKS.length);
  const nextTrack = () => setTrackIdx((i) => (i + 1) % TRACKS.length);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <>
      <style>{`
        @keyframes waveAnim {
          0%   { height: 4px; }
          50%  { height: 16px; }
          100% { height: 8px; }
        }
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 20px 4px rgba(167,139,250,0.25); }
          50%       { box-shadow: 0 0 40px 12px rgba(167,139,250,0.45); }
        }
      `}</style>

      <audio
        ref={audioRef}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onLoadedMetadata}
        onEnded={onEnded}
        preload="metadata"
      />

      <div className="flex min-h-screen flex-col bg-neutral-950 text-white">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold tracking-tight text-violet-400">ZEN</span>
            <span className="text-lg font-semibold text-white">Music</span>
          </div>
          <div className="flex gap-1.5">
            {TRACKS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-1.5 rounded-full transition-all ${
                  i === trackIdx ? "w-5 bg-violet-400" : "bg-white/20"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Album art area */}
        <div className="flex flex-1 flex-col items-center justify-between px-6 py-8">
          {/* Art disc */}
          <div className="relative mb-8 flex items-center justify-center">
            <div
              className={`flex h-56 w-56 items-center justify-center rounded-full bg-gradient-to-br ${track.color} text-8xl shadow-2xl`}
              style={{
                animation: playing ? "spin-slow 8s linear infinite" : "none",
                boxShadow: playing
                  ? "0 0 40px 12px rgba(167,139,250,0.35)"
                  : "0 8px 32px rgba(0,0,0,0.5)",
                transition: "box-shadow 0.5s",
              }}
            >
              {track.emoji}
            </div>
            {/* Center dot */}
            <div className="absolute h-8 w-8 rounded-full border-4 border-neutral-950 bg-neutral-800" />
            {/* Wave bars overlay */}
            {playing && (
              <div className="absolute -bottom-6 flex items-end gap-1">
                {["0s", "0.1s", "0.2s", "0.3s", "0.4s", "0.5s", "0.6s"].map((d, i) => (
                  <WaveBar key={i} playing={playing} delay={d} />
                ))}
              </div>
            )}
          </div>

          {/* Track info */}
          <div className="mb-6 text-center">
            <div className="mb-1 text-2xl font-bold tracking-tight">{track.title}</div>
            <div className="text-sm text-neutral-400">Sushi ZEN Original</div>
          </div>

          {/* Progress */}
          <div className="mb-6 w-full">
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={seek}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/10"
              style={{
                backgroundImage: `linear-gradient(to right, #a78bfa ${progress}%, transparent ${progress}%)`,
              }}
            />
            <div className="mt-2 flex justify-between text-xs text-neutral-500">
              <span>{fmtTime(currentTime)}</span>
              <span>{fmtTime(duration)}</span>
            </div>
          </div>

          {/* Controls */}
          <div className="mb-8 flex w-full items-center justify-between px-4">
            <button
              onClick={prevTrack}
              className="flex h-12 w-12 items-center justify-center rounded-full text-neutral-400 transition hover:text-white active:scale-95"
            >
              <SkipBack className="h-6 w-6" />
            </button>

            <button
              onClick={() => setPlaying((p) => !p)}
              className="flex h-18 w-18 items-center justify-center rounded-full bg-violet-600 shadow-lg transition hover:bg-violet-500 active:scale-95"
              style={{ width: "72px", height: "72px" }}
            >
              {playing ? <Pause className="h-8 w-8" /> : <Play className="h-8 w-8 translate-x-0.5" />}
            </button>

            <button
              onClick={nextTrack}
              className="flex h-12 w-12 items-center justify-center rounded-full text-neutral-400 transition hover:text-white active:scale-95"
            >
              <SkipForward className="h-6 w-6" />
            </button>
          </div>

          {/* Volume */}
          <div className="flex w-full items-center gap-3">
            <button onClick={() => setMuted((m) => !m)} className="text-neutral-400 hover:text-white">
              {muted || volume === 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={muted ? 0 : volume}
              onChange={(e) => {
                setVolume(Number(e.target.value));
                setMuted(false);
              }}
              className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/10"
              style={{
                backgroundImage: `linear-gradient(to right, #a78bfa ${(muted ? 0 : volume) * 100}%, transparent ${(muted ? 0 : volume) * 100}%)`,
              }}
            />
          </div>
        </div>

        {/* Playlist */}
        <div className="border-t border-white/8 px-4 pb-8 pt-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-neutral-500">Playlist</div>
          <div className="flex flex-col gap-2">
            {TRACKS.map((t, i) => (
              <button
                key={t.id}
                onClick={() => {
                  if (i === trackIdx) {
                    setPlaying((p) => !p);
                  } else {
                    setTrackIdx(i);
                    setPlaying(true);
                  }
                }}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-left transition active:scale-[0.98] ${
                  i === trackIdx
                    ? "bg-violet-600/20 ring-1 ring-violet-500/40"
                    : "bg-white/4 hover:bg-white/8"
                }`}
              >
                <div
                  className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${t.color} text-xl`}
                >
                  {t.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`truncate text-sm font-medium ${i === trackIdx ? "text-violet-300" : "text-white"}`}>
                    {t.title}
                  </div>
                  <div className="text-xs text-neutral-500">Sushi ZEN Original</div>
                </div>
                {i === trackIdx && (
                  <div className="flex items-end gap-0.5">
                    {["0s", "0.15s", "0.3s"].map((d, j) => (
                      <WaveBar key={j} playing={playing} delay={d} />
                    ))}
                  </div>
                )}
                {i !== trackIdx && (
                  <ChevronRight className="h-4 w-4 flex-shrink-0 text-neutral-600" />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

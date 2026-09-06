"""FLEURS のフィリピン語(fil_ph)を少量だけ取る。

⚠️ FLEURS は「文章を読み上げた」音声で、スタジオ品質・単一言語。
実際の応募者は **スマホのマイクで、タグリッシュを、自然に話す**。
つまりこれは「そのエンジンがフィリピン語を扱えるか」の一次選別であって、
「うちの録音で何位か」ではない。差を縮めるため、次の段で
**実際の配信形式（Opus 24kbps mono / WebM）に落として**から測る。
"""
import os, json, io, soundfile as sf
from datasets import load_dataset

OUT = os.path.join(os.path.dirname(__file__), "fleurs")
os.makedirs(OUT, exist_ok=True)
N = int(os.environ.get("N", "20"))

ds = load_dataset("google/fleurs", "fil_ph", split="test", streaming=True)
rows = []
for i, ex in enumerate(ds):
    if i >= N: break
    a = ex["audio"]
    path = os.path.join(OUT, f"fil_{i:03d}.wav")
    sf.write(path, a["array"], a["sampling_rate"])
    rows.append({"id": f"fil_{i:03d}", "lang": "fil",
                 "ref": ex["transcription"], "raw": ex.get("raw_transcription", ""),
                 "sr": a["sampling_rate"],
                 "sec": round(len(a["array"]) / a["sampling_rate"], 1),
                 "wav": path})
    print(f"  {i:3d} {rows[-1]['sec']:5.1f}s  {ex['transcription'][:70]}")

with open(os.path.join(OUT, "manifest.json"), "w") as f:
    json.dump(rows, f, ensure_ascii=False, indent=1)
print(f"\n{len(rows)} 件 / 合計 {sum(r['sec'] for r in rows):.0f} 秒 → {OUT}")

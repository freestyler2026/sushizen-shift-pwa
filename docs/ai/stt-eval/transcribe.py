"""候補エンジンで文字起こしし、参照テキストとの WER を出す。

比較は3条件で行う:
  clean  スタジオ品質（上限）
  opus   うちの実際の配信形式（24 kbps）
  noisy  それに厨房相当のノイズ

⚠️ WER の差だけで決めない。FLEURS は読み上げで、実際の応募者は
タグリッシュを自然に話す。ここで測れるのは「フィリピン語を扱えるか」と
「うちのコーデックで何%落ちるか」まで。
"""
import json, os, sys, time, re
import jiwer

BASE = os.path.join(os.path.dirname(__file__), "fleurs")
man = json.load(open(os.path.join(BASE, "manifest.json")))
COND = sys.argv[1] if len(sys.argv) > 1 else "opus"
ENGINE = sys.argv[2] if len(sys.argv) > 2 else "whisper-1"
KEYMAP = {"clean": "wav", "opus": "opus", "noisy": "noisy"}

# 参照側も仮説側も同じ正規化を通す。片方だけ整えると WER は無意味になる。
NORM = jiwer.Compose([
    jiwer.ToLowerCase(),
    jiwer.RemovePunctuation(),
    jiwer.RemoveMultipleSpaces(),
    jiwer.Strip(),
    jiwer.ReduceToListOfListOfWords(),
])

def openai_transcribe(path, model):
    from openai import OpenAI
    client = OpenAI()
    with open(path, "rb") as f:
        kw = {"model": model, "file": f, "language": "tl"}
        if model.startswith("whisper"):
            kw["response_format"] = "text"
        r = client.audio.transcriptions.create(**kw)
    return r if isinstance(r, str) else getattr(r, "text", str(r))

rows, t0 = [], time.time()
for r in man:
    path = r[KEYMAP[COND]]
    try:
        hyp = openai_transcribe(path, ENGINE).strip()
    except Exception as e:
        hyp = ""
        print(f"  {r['id']} 失敗: {type(e).__name__}: {str(e)[:110]}")
    w = jiwer.wer(r["ref"], hyp, reference_transform=NORM, hypothesis_transform=NORM) if hyp else 1.0
    rows.append({"id": r["id"], "wer": w, "ref": r["ref"], "hyp": hyp})
    print(f"  {r['id']}  WER {w*100:5.1f}%  {hyp[:66]}")

ok = [x for x in rows if x["hyp"]]
overall = jiwer.wer([x["ref"] for x in ok], [x["hyp"] for x in ok],
                    reference_transform=NORM, hypothesis_transform=NORM) if ok else 1.0
print(f"\n{ENGINE} / {COND}: 全体 WER {overall*100:.1f}%  "
      f"（{len(ok)}/{len(rows)} 件成功, {time.time()-t0:.0f} 秒）")
out = os.path.join(BASE, f"result_{ENGINE}_{COND}.json")
json.dump({"engine": ENGINE, "condition": COND, "wer": overall, "rows": rows},
          open(out, "w"), ensure_ascii=False, indent=1)
print("→", out)

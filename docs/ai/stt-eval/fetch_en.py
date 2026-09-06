"""fil で取った20文と「同じ文」の英語音声を取る。

FLEURS の第1列は FLoRes の文ID で、349文が両言語に存在する。
同じIDを引けば**同じ内容の対訳**になり、
  ・英語単体の精度
  ・英語→タガログを1本に繋いだ混在音声（タグリッシュの粗い代用）
の両方が作れる。
"""
import csv, json, os, tarfile, urllib.request

HERE = os.path.dirname(__file__)
BASE = os.path.join(HERE, "fleurs")
EN = os.path.join(BASE, "en"); os.makedirs(EN, exist_ok=True)

fil = json.load(open(os.path.join(BASE, "manifest.json")))
# fil 側の元ファイル名 → 文ID を引く
fil_id = {}
for row in csv.reader(open(os.path.join(HERE, "fil_test.tsv"), encoding="utf-8"), delimiter="\t"):
    if len(row) >= 3:
        fil_id[row[1]] = row[0]
want = {}                       # 文ID -> fil の連番
for r in fil:
    sid = fil_id.get(r["src"])
    if sid:
        want.setdefault(sid, r["id"])
        r["sent_id"] = sid

# 英語側：その文IDの音声ファイル名と参照テキスト
en_rows = {}
for row in csv.reader(open(os.path.join(HERE, "en_test.tsv"), encoding="utf-8"), delimiter="\t"):
    if len(row) >= 3 and row[0] in want and row[1] not in en_rows:
        en_rows[row[1]] = (row[0], row[2])
print(f"対象の文ID {len(want)} / 英語側の候補ファイル {len(en_rows)}")

url = "https://huggingface.co/datasets/google/fleurs/resolve/main/data/en_us/audio/test.tar.gz"
req = urllib.request.Request(url, headers={"User-Agent": "sushizen-stt-eval"})
got, seen = [], set()
with urllib.request.urlopen(req, timeout=180) as resp:
    with tarfile.open(fileobj=resp, mode="r|gz") as tf:
        for m in tf:
            if not m.isfile() or not m.name.endswith(".wav"):
                continue
            name = os.path.basename(m.name)
            if name not in en_rows:
                continue
            sid, ref = en_rows[name]
            if sid in seen:
                continue
            seen.add(sid)
            data = tf.extractfile(m).read()
            path = os.path.join(EN, f"en_{want[sid]}.wav")
            open(path, "wb").write(data)
            got.append({"id": f"en_{want[sid]}", "pair": want[sid], "sent_id": sid,
                        "ref": ref, "wav": path, "sec": round(len(data)/32000, 1)})
            print(f"  {len(got):3d}/{len(want)}  {got[-1]['sec']:5.1f}s  {ref[:62]}")
            if len(seen) >= len(want):
                break

json.dump(got, open(os.path.join(BASE, "manifest_en.json"), "w"), ensure_ascii=False, indent=1)
json.dump(fil, open(os.path.join(BASE, "manifest.json"), "w"), ensure_ascii=False, indent=1)
print(f"\n英語 {len(got)} 件 / 合計 {sum(r['sec'] for r in got):.0f} 秒")

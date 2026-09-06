"""tar.gz を最後まで落とさずに、先頭 N 件だけ取り出す。

848 MB のうち必要なのは 20 件 ≒ 20 MB。tar は順次読みなので、
ストリームのまま N 件取ったら閉じる。
"""
import csv, io, json, os, tarfile, urllib.request

BASE = os.path.join(os.path.dirname(__file__), "fleurs")
os.makedirs(BASE, exist_ok=True)
N = int(os.environ.get("N", "20"))
TSV = os.path.join(os.path.dirname(__file__), "fil_test.tsv")

ref = {}
with open(TSV, encoding="utf-8") as f:
    for row in csv.reader(f, delimiter="\t"):
        if len(row) >= 3:
            ref[row[1]] = row[2]
print(f"参照テキスト {len(ref)} 件")

url = "https://huggingface.co/datasets/google/fleurs/resolve/main/data/fil_ph/audio/test.tar.gz"
req = urllib.request.Request(url, headers={"User-Agent": "sushizen-stt-eval"})
rows, got = [], 0
with urllib.request.urlopen(req, timeout=120) as resp:
    with tarfile.open(fileobj=resp, mode="r|gz") as tf:
        for m in tf:
            if not m.isfile() or not m.name.endswith(".wav"):
                continue
            name = os.path.basename(m.name)
            if name not in ref:
                continue
            data = tf.extractfile(m).read()
            path = os.path.join(BASE, f"fil_{got:03d}.wav")
            with open(path, "wb") as out:
                out.write(data)
            rows.append({"id": f"fil_{got:03d}", "src": name, "ref": ref[name],
                         "wav": path, "bytes": len(data), "sr": 16000,
                         "sec": round(len(data) / 32000, 1)})
            print(f"  {got:3d} {rows[-1]['sec']:5.1f}s  {ref[name][:64]}")
            got += 1
            if got >= N:
                break

json.dump(rows, open(os.path.join(BASE, "manifest.json"), "w"), ensure_ascii=False, indent=1)
print(f"\n{len(rows)} 件 / 合計 {sum(r['sec'] for r in rows):.0f} 秒")

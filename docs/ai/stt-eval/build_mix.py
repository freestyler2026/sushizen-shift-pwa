"""英語→タガログを1本に繋いだ混在音声を作る。

⚠️ **これはタグリッシュそのものではない。** 実際のタグリッシュは文の中で
切り替わる（"Nag-work ako sa restaurant for three years"）。これは
文単位の切り替えで、粗い代用。それでも**1本の音声に2言語が入ったとき、
言語指定がどう効くか**という、いちばん決定に関わる点は測れる。

同じ文IDの対訳なので、内容は重複する。参照は英語＋タガログの連結。
"""
import json, os, subprocess

HERE = os.path.dirname(__file__)
BASE = os.path.join(HERE, "fleurs")
MIX = os.path.join(BASE, "mix"); os.makedirs(MIX, exist_ok=True)
fil = {r["id"]: r for r in json.load(open(os.path.join(BASE, "manifest.json")))}
en = json.load(open(os.path.join(BASE, "manifest_en.json")))

def run(a):
    r = subprocess.run(a, capture_output=True)
    if r.returncode: raise RuntimeError(r.stderr.decode()[-300:])

rows = []
for e in en:
    f = fil[e["pair"]]
    out = os.path.join(MIX, f"mix_{e['pair']}.webm")
    lst = os.path.join(MIX, "in.txt")
    with open(lst, "w") as fh:
        fh.write(f"file '{os.path.abspath(e['wav'])}'\nfile '{os.path.abspath(f['wav'])}'\n")
    # 連結してから、うちの実形式（Opus 24k mono）に落とす
    run(["ffmpeg","-y","-loglevel","error","-f","concat","-safe","0","-i",lst,
         "-c:a","libopus","-b:a","24k","-ac","1","-ar","48000",
         "-vbr","on","-application","voip", out])
    rows.append({"id": f"mix_{e['pair']}", "ref": e["ref"] + " " + f["ref"],
                 "opus": out, "sec": round(e["sec"] + f["sec"], 1)})
    print(f"  {rows[-1]['id']}  {rows[-1]['sec']:5.1f}s  {os.path.getsize(out)//1024:3d} KB")
os.remove(os.path.join(MIX, "in.txt"))
json.dump(rows, open(os.path.join(BASE, "manifest_mix.json"), "w"), ensure_ascii=False, indent=1)
print(f"\n混在 {len(rows)} 本 / 合計 {sum(r['sec'] for r in rows):.0f} 秒")

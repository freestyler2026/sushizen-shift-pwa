"""FLEURS の綺麗な音声を、うちの実際の配信形式まで落とす。

これをやらないと「スタジオ品質でどのエンジンが強いか」しか分からない。
実際に文字起こしにかかるのは、ブラウザの MediaRecorder が
`audio/webm; codecs=opus` / audioBitsPerSecond=24000 / モノラルで書き出し、
スマホのマイクで拾った音声。**コーデックの劣化だけでも再現しておく。**

つくるもの:
  clean : 元のまま（16 kHz WAV）           ← 上限を知るための対照
  opus  : Opus 24 kbps モノラル WebM        ← うちの実際の形式
  noisy : opus に厨房相当のノイズを足したもの ← SNR 15 dB
"""
import json, os, subprocess, sys, math, wave, struct, random

BASE = os.path.join(os.path.dirname(__file__), "fleurs")
man = json.load(open(os.path.join(BASE, "manifest.json")))
for sub in ("opus", "noisy"):
    os.makedirs(os.path.join(BASE, sub), exist_ok=True)

def run(args):
    r = subprocess.run(args, capture_output=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.decode()[-400:])

def make_noise(path, seconds, sr=16000):
    """厨房の暗騒音の代用。ピンクに近い低域寄りのノイズ。"""
    random.seed(7)
    n = int(seconds * sr)
    b = [0.0] * 7
    frames = bytearray()
    for _ in range(n):
        w = random.uniform(-1, 1)
        b[0] = 0.99886*b[0] + w*0.0555179; b[1] = 0.99332*b[1] + w*0.0750759
        b[2] = 0.96900*b[2] + w*0.1538520; b[3] = 0.86650*b[3] + w*0.3104856
        b[4] = 0.55000*b[4] + w*0.5329522; b[5] = -0.7616*b[5] - w*0.0168980
        v = sum(b[:6]) + b[6] + w*0.5362; b[6] = w*0.115926
        frames += struct.pack("<h", max(-32767, min(32767, int(v*3000))))
    with wave.open(path, "wb") as f:
        f.setnchannels(1); f.setsampwidth(2); f.setframerate(sr)
        f.writeframes(bytes(frames))

for r in man:
    src = r["wav"]
    opus = os.path.join(BASE, "opus", r["id"] + ".webm")
    # MediaRecorder と同じ: WebM コンテナ / Opus / 24 kbps / モノラル / 48 kHz
    run(["ffmpeg","-y","-loglevel","error","-i",src,
         "-c:a","libopus","-b:a","24k","-ac","1","-ar","48000",
         "-vbr","on","-application","voip", opus])
    r["opus"] = opus

    noise = os.path.join(BASE, "noisy", r["id"] + "_n.wav")
    make_noise(noise, r["sec"] + 0.5, r["sr"])
    noisy = os.path.join(BASE, "noisy", r["id"] + ".webm")
    # SNR 15 dB 相当で混ぜてから同じコーデックへ
    run(["ffmpeg","-y","-loglevel","error","-i",src,"-i",noise,
         "-filter_complex","[1:a]volume=0.18[n];[0:a][n]amix=inputs=2:duration=first:dropout_transition=0",
         "-c:a","libopus","-b:a","24k","-ac","1","-ar","48000",
         "-vbr","on","-application","voip", noisy])
    r["noisy"] = noisy
    os.remove(noise)
    print(f"  {r['id']}  wav {os.path.getsize(src)//1024:4d} KB "
          f"→ opus {os.path.getsize(opus)//1024:3d} KB / noisy {os.path.getsize(noisy)//1024:3d} KB")

json.dump(man, open(os.path.join(BASE, "manifest.json"), "w"), ensure_ascii=False, indent=1)
print(f"\n{len(man)} 件を3条件で用意しました")

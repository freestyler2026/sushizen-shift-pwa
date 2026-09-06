"""録音された実ファイルを見て、再生できない理由を切り分ける。"""
from app.db import get_conn
from app.db_voice_screening import answer_audio_ref
from app.services.ar_drive import _get_drive_service, download_file_bytes
from psycopg2.extras import RealDictCursor
c=get_conn(); cur=c.cursor(cursor_factory=RealDictCursor)
cur.execute("""SELECT s.id sid, a.full_name, v.seq, v.mime_type, v.bytes,
                      v.duration_seconds, LEFT(v.drive_file_id,12) fid
                 FROM hr_voice_answers v
                 JOIN hr_voice_screenings s ON s.id=v.screening_id
                 JOIN hr_applicants a ON a.id=s.applicant_id
                ORDER BY v.id LIMIT 8""")
rows=[dict(r) for r in cur.fetchall()]
for r in rows: print("  ", r)
c.close()
if not rows: raise SystemExit("録音なし")

sid, seq = rows[0]["sid"], rows[0]["seq"]
ref = answer_audio_ref(sid, seq)
data = download_file_bytes(_get_drive_service(), ref["file_id"])
print(f"\n実ファイル: {len(data)} bytes  mime={ref['mime_type']}")
print("先頭16バイト:", data[:16].hex(" "))
sig = data[:4]
print("コンテナ:", "WebM/Matroska (EBML)" if sig == b"\x1aE\xdf\xa3"
      else "MP4/ISOBMFF" if data[4:8]==b"ftyp" else "OggS" if sig==b"OggS" else "不明")
# WebM のヘッダに Duration 要素があるか（MediaRecorder は書かないことが多い）
print("Duration 要素(0x4489) の有無:", "あり" if b"\x44\x89" in data[:2048] else "なし ← 0:00 表示の原因")
print("Cues/SeekHead の有無:", "あり" if b"\x1c\x53\xbb\x6b" in data[:4096] else "なし ← シーク不可の原因")
# ffprobe があれば実際に読めるか
import subprocess, tempfile, shutil, os
if shutil.which("ffprobe"):
    with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as f:
        f.write(data); path=f.name
    out = subprocess.run(["ffprobe","-v","error","-show_entries",
                          "format=format_name,duration,size:stream=codec_name,channels,sample_rate",
                          "-of","default=nw=1", path], capture_output=True, text=True)
    print("\nffprobe:\n"+ (out.stdout or out.stderr))
    os.unlink(path)
else:
    print("\nffprobe なし（コンテナ判定のみ）")

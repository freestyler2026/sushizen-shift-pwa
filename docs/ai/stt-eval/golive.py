"""チャンネルをDBに反映し、前日分のレビューを生成する。"""
from app.db import seed_access_control_defaults, get_conn
from app.db_ops_review import generate_for_city, list_reviews
from psycopg2.extras import RealDictCursor

seed_access_control_defaults()
c=get_conn(); cur=c.cursor(cursor_factory=RealDictCursor)
cur.execute("SELECT channel_key, route_path FROM access_channels WHERE channel_key='store.management_review'")
print("チャンネル:", [dict(r) for r in cur.fetchall()])
cur.execute("SELECT role_key FROM access_role_permissions WHERE permission_key='channel.store.management_review.view' ORDER BY 1")
print("付与ロール:", [r["role_key"] for r in cur.fetchall()])
c.close()

for city in ("manila","dubai"):
    r = generate_for_city(city)
    made=[x for x in r["results"] if x.get("created")]
    skip=[x for x in r["results"] if not x.get("created") and not x.get("error")]
    err=[x for x in r["results"] if x.get("error")]
    print(f"\n=== {city} {r['date']} ===")
    for m in made:
        print(f"   {m['branch']:5s} items={m['items']:3d}  担当={m.get('assigned_to') or '(未設定)'}")
    if skip: print("   対象なし:", [x["branch"] for x in skip])
    if err:  print("   エラー:", err)

print("\n=== 生成されたレビュー（open・古い順）===")
for r in list_reviews(status="open", limit=30):
    s=r["summary"]
    print(f"   #{r['id']} {r['city']:6s} {r['branch']:5s} {r['review_date']}  "
          f"items {r['items']:2d}  写真{s['quality']['graded']:3d}枚 "
          f"C/D/F {s['quality']['grades']['c']}/{s['quality']['grades']['d']}/{s['quality']['grades']['f']}  "
          f"prep={'○' if s['prep']['measurable'] else '×'}  担当={r['assigned_to'] or '(未設定)'}")

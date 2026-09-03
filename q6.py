import os, psycopg2, psycopg2.extras
c=psycopg2.connect(os.environ["DATABASE_URL"], sslmode="require")
cur=c.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
def q(sql,p=()):
    cur.execute("SAVEPOINT s")
    try: cur.execute(sql,p); r=cur.fetchall(); cur.execute("RELEASE SAVEPOINT s"); return r
    except Exception as e: cur.execute("ROLLBACK TO SAVEPOINT s"); return [{"ERR":str(e)[:110]}]

print("=== management_tasks: 未クローズの現況 ===")
for r in q("""SELECT status, COUNT(*) n, MIN(created_at)::date oldest FROM management_tasks
 WHERE status NOT IN ('closed') GROUP BY 1 ORDER BY n DESC"""): print("  ",dict(r))
print("  種別別 (open+sent):")
for r in q("""SELECT task_type, COUNT(*) n, MAX(created_at)::date newest FROM management_tasks
 WHERE status NOT IN ('closed') GROUP BY 1 ORDER BY n DESC LIMIT 12"""): print("   ",dict(r))

print("\n=== Cold Chain 氏名なし ===")
for r in q("""SELECT COUNT(*) n, MIN(created_at)::date f, MAX(created_at)::date l FROM cold_chain_boxes
 WHERE received_by IS NULL OR TRIM(received_by)=''"""): print("  ",dict(r))

print("\n=== Par設定 操作者なし ===")
for r in q("""SELECT COUNT(*) n, MIN(updated_at)::date f, MAX(updated_at)::date l FROM backup_par_levels
 WHERE updated_by IS NULL OR TRIM(updated_by)=''"""): print("  ",dict(r))

print("\n=== proc_claims: 供給者別 ≥2000 の未解決 ===")
for r in q("""SELECT responsible_party, COUNT(*) n, ROUND(SUM(ABS(amount_impact))::numeric,0) amt,
  MIN(created_at)::date oldest FROM proc_claims
 WHERE LOWER(status)='open' AND claim_type='SHORTAGE' AND ABS(amount_impact)>=2000
 GROUP BY 1 ORDER BY amt DESC LIMIT 15"""): print("  ",dict(r))

print("\n=== hr_onboarding_items: 対象者 ===")
for r in q("""SELECT o.staff_name, COUNT(*) n, MIN(i.created_at)::date since
 FROM hr_onboarding_items i JOIN hr_onboarding o ON o.id=i.onboarding_id
 WHERE LOWER(i.status)='pending' GROUP BY 1 ORDER BY n DESC LIMIT 15"""): print("  ",dict(r))

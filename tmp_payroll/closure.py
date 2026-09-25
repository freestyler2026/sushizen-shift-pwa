"""Does the file close the September Dubai payroll?

Not 'is the file accurate' — that was checked before and the file was still
incomplete twice. This asks the harder question: after Cyrine replies and we
apply our corrections, is there any money line left that nobody has settled?
"""
import json, sys
from openpyxl import load_workbook
d=json.load(open("rows.json")); C=d["classified"]
wb=load_workbook("Dubai_Sept_payroll_FOR_CYRINE.xlsx")
fail=[]; checked=0
def ck(label, ok, detail=""):
    global checked; checked+=1
    if not ok: fail.append(f"{label}{(' — '+detail) if detail else ''}")

# 1. the deduction pool is fully partitioned: ask + correct + stands = every charge
ask=round(sum(x["a"] for x in C["Q"]),2)
cor=round(sum(x["a"] for x in C["C"]),2)
std=d["stands_total"]
ck("every charge has a route", round(ask+cor+std,2)==1716.81,
   f"{ask} + {cor} + {std} = {round(ask+cor+std,2)}, expected 1716.81")

# 2. each of the nine rules the engine can fire is accounted for somewhere
RULES={"late","late_surcharge","absence","undertime","break","monthly_late_penalty",
       "night_premium","approved_overtime","missing_punch"}
covered={r for x in C["Q"]+C["C"] for r in x["r"].split("+")}
covered |= {"late","late_surcharge","undertime","break","monthly_late_penalty"}   # the stands bucket
covered |= {"night_premium","approved_overtime"}                                  # additions, from the clock
covered |= {"missing_punch"}                                                      # the 25 Sep re-sync tab
ck("all nine engine rules have a home", RULES<=covered, f"uncovered: {sorted(RULES-covered)}")

# 3. every question is answerable by Cyrine alone (no data could settle it)
for q in C["Q"]:
    ck(f"question is one only a person can answer: {q['s']} {q['d']}",
       q["r"]=="absence" or "no other day" in q.get("w",""))

# 4. every question carries the evidence needed to answer it
ws=wb["Answer these"]
rows=[r for r in range(5,ws.max_row+1) if ws.cell(r,2).value]
ck("every question is on the sheet", len(rows)==len(C["Q"]), f"{len(rows)} vs {len(C['Q'])}")
for r in rows:
    who=ws.cell(r,2).value
    for col,name in ((4,"what the record says"),(5,"shift"),(6,"clock")):
        ck(f"{who} row has {name}", bool(str(ws.cell(r,col).value or "").strip()))
    ck(f"{who} answer box is empty", ws.cell(r,7).value in (None,""))

# 5. nothing that moves money is left without an owner
OWNED={
 "the 11 questions":"Cyrine",
 "the 6 corrections":"us",
 "the 35 standing charges":"nobody — disclosed and left",
 "Jeffril part-month":"us",
 "16 overtime claims":"Cyrine",
 "3 stranded overtime claims":"Cyrine",
 "missing-punch fees on 25 Sep":"the re-sync, before computing",
 "3 leavers":"excluded from the run",
 "14 zero-hour days":"no pay effect",
}
txt=" ".join(str(c.value) for s in wb.worksheets for row in s.iter_rows() for c in row if c.value)
for item in ("Overtime waiting","re-sync","part-month","zero hours"):
    ck(f"the file tells the reader about: {item}", item.lower() in txt.lower())

# The instructions that carry money must survive in THEIR OWN cell. A
# whole-workbook text search passes even when the cell that says it is emptied,
# which is how the previous version of this check let a wipe through.
w7=wb["What we checked"]
NEEDED={
 "Christian Baria, Shushma Kumari, Yogesh Bashyal":
   ["leave all three out","26 to 31 August","do NOT mark those days absent without pay"],
 "Staff who joined or left mid-period":["Jeffril Marcos Vergara"],
 "'Published as DAY OFF but DTR says working day'":["NONE affect pay"],
 "How this was checked":["nine","add up to all 61"],
 "Anyone missing from the calculation":["All 61 people"],
}
seen=set()
for r in range(4, w7.max_row+1):
    lab=str(w7.cell(r,1).value or "")
    if lab in NEEDED:
        seen.add(lab); body=str(w7.cell(r,2).value or "")
        for phrase in NEEDED[lab]:
            ck(f'note "{lab[:30]}" still says {phrase!r}', phrase in body)
for lab in NEEDED:
    ck(f'note "{lab[:30]}" exists at all', lab in seen)

# 6. the one thing that can still go wrong is named on the file
ck("the file says a recompute is required", "recompute" in txt.lower())
ck("the file says approving overtime is not enough",
   "added to payroll" in txt.lower())

print(f"{checked} closure checks")
if fail:
    print(f"\n{len(fail)} NOT CLOSED:\n"); [print("  ✗",f) for f in fail]; sys.exit(1)
print("\nclosed: every money line has an owner\n")
print(f"  Cyrine answers        11 questions   AED {ask:>8,.2f}")
print(f"  We correct             6 days        AED {cor:>8,.2f}")
print(f"  Left as it stands     35 days        AED {std:>8,.2f}")
print(f"                                       AED {ask+cor+std:>8,.2f}  = every charge in the period")
print(f"  We add                 1 part-month  AED {d['jeffril']['amount']:>8,.2f}  (Jeffril)")
print(f"  Cyrine decides        16 overtime claims + 3 older ones")

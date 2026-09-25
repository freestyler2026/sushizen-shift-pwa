import json
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

d = json.load(open("rows.json")); C = d["classified"]
F="Arial"
HF=PatternFill("solid",fgColor="1F3864"); HFONT=Font(name=F,bold=True,color="FFFFFF",size=10)
TITLE=Font(name=F,bold=True,size=14); SUB=Font(name=F,size=10,color="555555")
BODY=Font(name=F,size=10); BOLD=Font(name=F,size=10,bold=True)
ASK=PatternFill("solid",fgColor="FFF2CC")
THIN=Border(*[Side(style="thin",color="D9D9D9")]*4); TOP=Alignment(vertical="top",wrap_text=True)
wb=Workbook()

def head(ws,cols,row=4):
    for i,(l,w) in enumerate(cols,1):
        c=ws.cell(row=row,column=i,value=l); c.fill,c.font=HF,HFONT
        c.alignment=Alignment(vertical="center",wrap_text=True)
        ws.column_dimensions[get_column_letter(i)].width=w
    ws.row_dimensions[row].height=30
def intro(ws,t,s,span):
    ws["A1"]=t; ws["A1"].font=TITLE
    ws["A2"]=s; ws["A2"].font=SUB; ws["A2"].alignment=Alignment(wrap_text=True,vertical="top")
    ws.merge_cells(f"A2:{span}2")
    ws.row_dimensions[2].height=16*(len(s)//95+2)

# ---- 1. the questions -------------------------------------------------
ws=wb.active; ws.title="Answer these"
intro(ws,f"Dubai September payroll — {len(C['Q'])} questions for you",
 "Period 26 August to 25 September. These are the only days no record can settle: somebody is marked as not "
 "coming in, and nothing in the data can tell us whether that is right. Fill in the two yellow columns and send "
 "this back. Everything else in this file either needs one click ('Overtime waiting') or is being corrected at "
 "this end ('We are correcting these').","H")
head(ws,[("#",4),("Staff",23),("Date",12),("What the record says",30),("Shift published",26),
         ("Clocked in–out",20),("➜ YOUR ANSWER",26),("➜ Your note",30)])
ws.freeze_panes="A5"
for i,q in enumerate(C["Q"],1):
    says = "marked absent without pay — no clock-in" if q["r"]=="absence" else \
           f"{q.get('L')} minutes late — {q['w']}"
    for j,v in enumerate((i,q["s"],q["d"],says,q["ros"],q["p"],"","")):
        c=ws.cell(row=4+i,column=j+1,value=v); c.font=BOLD if j==1 else BODY
        c.alignment=TOP; c.border=THIN
        if j>=6: c.fill=ASK
    opts='"Yes - real absence,No - was on leave,No - actually worked,Other"' if q["r"]=="absence" \
         else '"Shift is correct - he was late,Shift is wrong - fix it,Other"'
    dv=DataValidation(type="list",formula1=opts,allow_blank=True,showDropDown=False)
    ws.add_data_validation(dv); dv.add(ws.cell(row=4+i,column=7))
    ws.row_dimensions[4+i].height=32

# ---- 2. corrections ----------------------------------------------------
w2=wb.create_sheet("We are correcting these")
intro(w2,f"Being corrected at this end — {len(C['C'])} days, no answer needed",
 "The record contradicts itself on these, so they are not questions. Listed so you can see what is changing. "
 "If you say nothing, these go ahead.","F")
head(w2,[("Date",12),("Staff",23),("What it is",14),("Why it cannot stand",44),("Clocked in–out",20),("➜ Object?",14)])
for i,x in enumerate(C["C"]):
    for j,v in enumerate((x["d"],x["s"],x["r"],x["w"],x["p"],"")):
        c=w2.cell(row=5+i,column=j+1,value=v); c.font=BOLD if j==1 else BODY
        c.alignment=TOP; c.border=THIN
        if j==5: c.fill=ASK
w2.cell(row=5+len(C["C"])+2,column=1,value="Also being corrected").font=Font(name=F,bold=True,size=11)
w2.cell(row=5+len(C["C"])+3,column=1,value=
 f"Jeffril Marcos Vergara — {d['jeffril']['note']} We are adding it; nothing needed from you.").font=BODY
w2.cell(row=5+len(C["C"])+3,column=1).alignment=Alignment(wrap_text=True,vertical="top")
w2.merge_cells(start_row=5+len(C["C"])+3,start_column=1,end_row=5+len(C["C"])+3,end_column=6)
w2.row_dimensions[5+len(C["C"])+3].height=34
w2.freeze_panes="A5"

# ---- 3. overtime -------------------------------------------------------
w3=wb.create_sheet("Overtime waiting")
intro(w3,f"Overtime nobody has approved or rejected — {len(d['overtime_pending'])} claims",
 "This is money owed TO staff, not a deduction, which is why nothing on screen complains about it. They sit as "
 "'pending' and pay nothing. Approve or reject each one before the payroll is computed. Approving is not enough "
 "— an approved claim also has to be added to payroll.","E")
head(w3,[("Date",12),("Staff",26),("Claimed",12),("➜ Approve / Reject",22),("➜ Your note",30)])
for i,o in enumerate(d["overtime_pending"]):
    for j,v in enumerate((o["date"],o["staff"],f"{o['min']} min","","")):
        c=w3.cell(row=5+i,column=j+1,value=v); c.font=BOLD if j==1 else BODY; c.border=THIN
        if j>=3: c.fill=ASK
    dv=DataValidation(type="list",formula1='"Approve,Reject"',allow_blank=True,showDropDown=False)
    w3.add_data_validation(dv); dv.add(w3.cell(row=5+i,column=4))
r=5+len(d["overtime_pending"])+2
w3.cell(row=r,column=1,value="Older claims, in a period already closed — tell us what to do with these").font=Font(name=F,bold=True,size=11)
for i,o in enumerate(d["overtime_stranded"]):
    for j,v in enumerate((o["date"],o["staff"],f"{o['min']} min","","")):
        c=w3.cell(row=r+1+i,column=j+1,value=v); c.font=BOLD if j==1 else BODY; c.border=THIN
        if j>=3: c.fill=ASK
w3.freeze_panes="A5"

# ---- 4. tonight --------------------------------------------------------
w4=wb.create_sheet("Before you compute")
intro(w4,"Do this on the night of 25 September, before the payroll is computed",
 "1. Wait until the last shift of 25 September has finished and everyone has clocked out.   "
 "2. Run 'Sync from OS Attendance' for Dubai.   3. Then recompute.   "
 f"Why: {len(d['open_punchout_0925'])} people below still had no clock-out for 25 September when this file was "
 "made. Computing after 25 September without a re-sync charges each of them a one-hour admin fee for a day that "
 "was simply still in progress. The stored figures were also computed on 24 September, before your corrections, "
 "so a recompute is needed either way.","D")
head(w4,[("Staff",34),("Clocked out now?",20),("",16),("",16)])
for i,n in enumerate(d["open_punchout_0925"]):
    c=w4.cell(row=5+i,column=1,value=n); c.font=BODY; c.border=THIN
    c2=w4.cell(row=5+i,column=2,value=""); c2.fill=ASK; c2.border=THIN
w4.freeze_panes="A5"

# ---- 5. charged, not queried ------------------------------------------
w5=wb.create_sheet("Charged, not queried")
intro(w5,f"Charged and left as it stands — {d['stands_items']} days",
 "Lateness, early finishes and long breaks where the person clocks in on time, or works the full length, on "
 "their other days with the same start time or the same shift length. We are not asking about these. A few are "
 "listed as 'too few days to compare' and are under AED 10, so they are disclosed rather than queried. "
 "If you know one of them is wrong, say so; otherwise they stand.","C")
head(w5,[("",20),("",20),("",20)])
w5.cell(row=5,column=1,value="The full list is in the system under DTR Records for the period. "
        "Nothing here needs an answer.").font=BODY
w5.cell(row=5,column=1).alignment=Alignment(wrap_text=True,vertical="top")
w5.merge_cells("A5:C5"); w5.row_dimensions[5].height=30

# ---- 6. clock-outs -----------------------------------------------------
w6=wb.create_sheet("Clock-outs to repair")
intro(w6,f"Days recorded as zero hours worked — {len(d['zero_hours'])} rows",
 "The clock-out landed on the following day, so the system credited zero hours. NONE of these change September "
 "pay. Repair them when there is time; they do not hold up the payroll. Four are Bibek BK on four nights in a "
 "row, which points at the night shift rather than the person.","D")
head(w6,[("Date",12),("Staff",26),("Clocked in → out",30),("➜ Fixed?",14)])
for i,z in enumerate(d["zero_hours"]):
    for j,v in enumerate((z["date"],z["staff"],z["punch"],"")):
        c=w6.cell(row=5+i,column=j+1,value=v); c.font=BOLD if j==1 else BODY; c.border=THIN
        if j==3: c.fill=ASK
w6.freeze_panes="A5"

# ---- 7. what we checked -----------------------------------------------
w7=wb.create_sheet("What we checked")
intro(w7,"What was checked, and what was already correct","","B")
notes=[
 ("How this was checked","Every rule the Dubai payroll can apply was taken from the code — there are nine, and "
  "no other deduction or premium exists. All 61 charges they produce across the period were then classified by "
  "one test: does this person meet that same start time, or that same shift length, on their other days? If yes "
  "the charge stands; if never, it is corrected; if there are too few days to tell, it is a question. The three "
  "groups add up to all 61, which is how we know nothing is missing."),
 ("Split shifts you re-typed","All 21 rows now carry both segments and record no undertime. Correct."),
 ("Annual leave","147 leave days across 9 people are flagged, so none of those days is deducted. Correct."),
 ("Nishan Nepal 15 Sep","Now shows as a rest day. Correct."),
 ("Man Bahadur B K 21 Sep","Shift is published and the DTR has it. Correct. His clock-in time that day is question 11."),
 ("'Published as DAY OFF but DTR says working day'","106 rows on the previous file. NONE affect pay — Dubai only "
  "deducts a day marked absent without pay, and the day type is not in the calculation. Please ignore them. "
  "Listing them first on that file was our mistake."),
 ("Worked during annual leave","Nobody."),
 ("Worked on a rest day","Nobody."),
 ("Anyone missing from the calculation","Nobody. All 61 people with attendance have an active salary record."),
 ("Part-time (hourly) staff","8 people are paid by the hour: Bijien Mijar, Dipesh Thapa, Kelvin Gurung, Mahima "
  "Pansilu Dadallage, Padam Bahadur K C, Pukar K C, Raman Miya, Rubash Khadka. Lateness, absence and undertime "
  "carry no penalty for them, so those days are not queried."),
 ("Christian Baria, Shushma Kumari, Yogesh Bashyal","All three have left and their pay is settled, so none of "
  "them is on any list here. Their salary records are still switched on, so whoever builds the September run "
  "must leave all three out of it. For Yogesh, 26 to 31 August is paid annual leave and 1 to 25 September is "
  "not; the DTR still flags 1 to 10 September as paid leave, so please clear that — but do NOT mark those days "
  "absent without pay, because the part-month adjustment already covers the whole of 1 to 25 September."),
 ("Staff who joined or left mid-period","Man Bahadur B K joined 21 Sep, Sangita Giri K C 19 Sep, Dipesh Thapa "
  "12 Sep, Rubash Khadka 21 Sep, Chandra Gurung last worked 11 Sep, Sota Horii resigned 12 Sep, Bibek Tamang "
  "starts 27 Sep. All have a part-month adjustment except Jeffril Marcos Vergara, which we are adding."),
]
head(w7,[("Item",40),("Result",100)],row=3)
for i,(a,b) in enumerate(notes):
    for j,v in enumerate((a,b)):
        c=w7.cell(row=4+i,column=j+1,value=v); c.font=BOLD if j==0 else BODY
        c.alignment=TOP; c.border=THIN
    w7.row_dimensions[4+i].height=16*(len(b)//100+2)
w7.freeze_panes="A4"

out="Dubai_Sept_payroll_FOR_CYRINE.xlsx"; wb.save(out); print("wrote",out)

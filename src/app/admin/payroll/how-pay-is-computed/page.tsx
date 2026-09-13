"use client";

/**
 * How Pay Is Computed — the two cities, each under its own country's law.
 *
 * Written for the accountant and for whoever runs payroll. It is not a summary
 * of intent: every formula here is the one the engine actually applies
 * (app/manila_payroll_engine.py, app/dubai_payroll_engine.py), so a figure on a
 * payslip can be checked against this page without reading code.
 *
 * Keep the two in step. A rule that changes in the engine and not here turns
 * this page into a confident, wrong answer — worse than no page at all.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Scale } from "lucide-react";
import { getAuth, canAccessPayrollAdmin } from "@/lib/auth";
import {
  GLASS_CARD, TAB_CONTAINER, TAB_ACTIVE, TAB_INACTIVE,
  T_PAGE_TITLE, T_SECTION, T_BODY, T_CAPTION, T_LABEL,
} from "@/lib/ui-tokens";

type City = "manila" | "dubai";

/* ── small building blocks ─────────────────────────────────────────────── */

function Section({ id, title, children }: {
  id: string; title: string; children: React.ReactNode;
}) {
  return (
    <section id={id} className={`${GLASS_CARD} p-5 sm:p-6`}>
      <h2 className={`${T_SECTION} mb-3 scroll-mt-24`}>{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

/** A formula exactly as the engine applies it. Scrolls rather than wrapping —
 *  a broken line in a formula reads as a different formula. */
function Formula({ children }: { children: React.ReactNode }) {
  return (
    <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/30 p-4 text-[13px] leading-relaxed text-zinc-200">
      <code>{children}</code>
    </pre>
  );
}

function LawTable({ rows }: { rows: [string, string][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-sm">
        <thead>
          <tr>
            <th className={`${T_LABEL} w-[38%] pb-2 text-left`}>Authority</th>
            <th className={`${T_LABEL} pb-2 text-left`}>What it governs here</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([law, what]) => (
            <tr key={law} className="border-t border-white/5 align-top">
              <td className="py-2.5 pr-4 text-[13px] font-medium text-zinc-200">{law}</td>
              <td className="py-2.5 text-[13px] text-zinc-400">{what}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Note({ tone = "info", children }: {
  tone?: "info" | "warn"; children: React.ReactNode;
}) {
  const c = tone === "warn"
    ? "border-amber-500/30 bg-amber-900/15 text-amber-200"
    : "border-sky-500/25 bg-sky-900/15 text-sky-200";
  return (
    <div className={`rounded-xl border ${c} px-4 py-3 text-[13px] leading-relaxed`}>
      {children}
    </div>
  );
}

/* ── Manila ────────────────────────────────────────────────────────────── */

function Manila() {
  return (
    <div className="space-y-4">
      <Section id="mnl-law" title="What the law requires">
        <p className={T_BODY}>
          Four separate obligations, and <strong className="text-zinc-200">each is
          measured on a different base</strong>. Treating them as one
          &ldquo;statutory&rdquo; block is what produces wrong deductions for
          anyone who did not work a full month.
        </p>
        <LawTable rows={[
          ["RA 11199 (Social Security Act of 2018); SSS contribution schedule",
           "SSS and the WISP/MPF layer. The Monthly Salary Credit follows the month's actual remuneration, not the contract rate."],
          ["RA 11223 (Universal Health Care Act); PhilHealth Advisory 2025-0002",
           "PhilHealth. The premium follows the contractual monthly BASIC salary, excludes overtime and allowances, and is not pro-rated."],
          ["RA 9679; HDMF Circular No. 460",
           "Pag-IBIG. Two per cent of the month's actual compensation, capped at a ₱10,000 fund salary."],
          ["RA 10963 (TRAIN); RR 11-2018 Annex E",
           "Withholding tax, on the compensation actually paid in the pay period."],
          ["NIRC §79(H)",
           "Year-end adjustment: the year's tax is settled against what was withheld, before the last payment of the year."],
          ["PD 851 implementing rules §6; SSS Circular 22-P",
           "13th month pay and bonuses are not wage — they are outside every base above."],
          ["RA 9504",
           "A minimum wage earner is exempt from withholding tax, including on overtime and holiday pay."],
          ["Labor Code (holiday, rest day, overtime, night shift)",
           "The premiums that make up gross pay before any of the above is applied."],
        ]} />
      </Section>

      <Section id="mnl-base" title="Step 1 — the wage for the cut-off">
        <p className={T_BODY}>
          Cut-offs run from the 26th to the 10th, and the 11th to the 25th. The
          two together are one payroll month.
        </p>
        <Formula>{`G  =  sum of every earning and deduction on the payslip
       LESS  recoveries      (staff house, loans, tax already withheld)
       LESS  non-wage items  (13th month, bonuses, refunds)
       rounded to 2 decimals, half up

Included:  basic (pro-rated for a new hire), overtime, night differential,
           holiday and rest-day premiums, and the deductions for lateness,
           undertime and unpaid absence — which are negative.`}</Formula>
        <Note>
          Recoveries are money taken out of pay after it has been earned, not a
          reduction in what was earned. Netting them off would understate the
          contribution base — one ₱272.55 electricity recovery was enough to
          drop somebody a full ₱500 MSC bracket.
        </Note>
      </Section>

      <Section id="mnl-month" title="Step 2 — the month, and how it is split">
        <Formula>{`First cut-off:   M = 2 x G          (an estimate — the month is not over)
Second cut-off:  M = G(first) + G   (the actual month; this is where it settles)

This cut-off's share of any monthly amount:
    first cut-off   take = round(monthly x 0.5, 2)
    second cut-off  take = monthly - (what the first cut-off actually took)`}</Formula>
        <p className={T_BODY}>
          The second cut-off settles rather than taking another flat half, so the
          two always add up to exactly one row of the published schedule —
          whatever the first half&rsquo;s estimate turned out to be. Where the
          first half took more than the month owed, the difference comes back on
          the payslip as a refund for that scheme, by name.
        </p>
      </Section>

      <Section id="mnl-skip" title="When nothing is collected">
        <Formula>{`Nothing is collected when:
  G <= 0                                 no pay this cut-off
  it is the FIRST HALF, it is the person's first cut-off after hire,
  and days worked < half the days in the cut-off

Not waived. The whole month is collected from the second half, which is
where the pay is, and the payslip says so.

Only the first half can defer. The second half's next cut-off belongs to
the following month and collects its own, so deferring there would lose
the month's contribution rather than move it — the second half collects,
and the cap below is what protects a thin pay packet.

A separation settles itself: the last cut-off has no next one, so the
month is that cut-off alone (M = G, not 2G) and the whole month's
contributions are collected from it.`}</Formula>
        <Note>
          Half a month&rsquo;s contributions out of two days&rsquo; pay is not a
          proportional deduction. It is also capped: the employee&rsquo;s share
          can never exceed what the cut-off pays, and any balance that could not
          be taken is named on the payslip. The employer still owes each agency
          in full.
        </Note>
      </Section>

      <Section id="mnl-sss" title="SSS and WISP">
        <Formula>{`base   = M + COLA                        (the month's actual remuneration)
row    = the schedule row where  compensation_min <= base <= compensation_max
SSS    = row.employee_share              (read from the table, not computed)
WISP   = row.employee_mpf_share          (zero on every row up to MSC 20,000)

MSC runs ₱5,000 to ₱35,000 in ₱500 steps. A base of zero does not mean the
lowest row — the contribution is skipped entirely.`}</Formula>
        <p className={T_BODY}>
          Overtime, night differential, holiday premium and COLA all count:
          SSS Circular 22-P lists them, and RA 11199 §8(f) defines compensation
          as all actual remuneration. Someone with a heavy overtime month lands
          in a higher bracket, and that is the rule working, not an error.
        </p>
      </Section>

      <Section id="mnl-ph" title="PhilHealth">
        <Formula>{`base     = the CONTRACTUAL monthly basic salary, clamped to ₱10,000 – ₱100,000
premium  = round(base x 5%, 2)
employee = round(premium / 2, 2)        employer = premium - employee`}</Formula>
        <Note tone="warn">
          This is the one that does <strong>not</strong> follow actual pay. The
          premium is the same for a month with one day worked as for a full
          month, and it is due for the separation month in full. A month with no
          compensation at all is the only exception — PhilHealth Circular 32
          s.2003 leaves an unpaid period to the member to settle directly.
        </Note>
      </Section>

      <Section id="mnl-hdmf" title="Pag-IBIG">
        <Formula>{`compensation = M + COLA
base         = min(compensation, ₱10,000)      (the fund salary cap)
employee     = base x 1%   if compensation <= ₱1,500
               base x 2%   otherwise
employer     = base x 2%`}</Formula>
        <p className={T_BODY}>
          Actual compensation, like SSS. Someone paid ₱2,000 in their final month
          contributes ₱40.01, not the ₱200 the cap would give a full month.
        </p>
      </Section>

      <Section id="mnl-bir" title="Withholding tax">
        <Formula>{`A minimum wage earner is exempt — nothing is withheld (RA 9504).

de minimis = min(rice, ₱2,000) + min(clothing, ₱500)
           + min(laundry, ₱300) + min(medical, ₱250)     per month

taxable(month equivalent)
    = max( G x 2
           - 2 x (SSS + WISP + PhilHealth + Pag-IBIG actually taken here)
           - de minimis , 0 )

annual   = taxable x 12
tax      = bracket.base + bracket.rate x max(annual - bracket.over, 0)
this cut-off = round(tax / 12, 2) x 0.5        i.e. annual / 24`}</Formula>
        <p className={T_BODY}>
          Dividing the annual brackets by 24 <em>is</em> the semi-monthly column
          of Annex E — the two agree to the centavo. The contributions subtracted
          are the ones actually withheld this period, which is what RR 2-98
          requires; the doubling is only because the base is expressed as a
          month.
        </p>
        <Note tone="warn">
          Tax is never computed from the contract rate. A new hire paid ₱2,000.44
          for two days owes nothing: the semi-monthly tax-free floor is
          ₱10,416.67.
        </Note>
      </Section>

      <Section id="mnl-year" title="Year-end adjustment">
        <Formula>{`Runs on the December second cut-off, and on any separation.

year's taxable = sum over the year of (wage - contributions taken)
                 - de minimis x (cut-offs counted) / 2
                 + anything carried in from before this system

tax due   = the annual bracket applied to that
withheld  = everything withheld this year, plus what was carried in
difference = tax due - withheld
    positive -> collected from this pay
    negative -> refunded on this pay`}</Formula>
        <Note tone="warn">
          Payroll in this system starts 25 June 2026. For anyone employed before
          that, the earlier compensation and tax have to be entered first — and
          for anyone who worked elsewhere earlier in the same year, their previous
          employer&rsquo;s BIR Form 2316. Until they are, the payslip says the
          year is incomplete, and the adjustment will <strong>collect a shortfall
          but never pay a refund</strong>: a year missing its first half can only
          understate the tax due, so a shortfall is a floor and safe, while a
          refund would hand back tax that is genuinely owed.
        </Note>
      </Section>

      <Section id="mnl-year-boundary" title="Which month, which year">
        <Formula>{`payroll month  = 26th of the previous month to the 25th, named for the
                 month it is PAID in
payroll year   = the cut-offs paid in that calendar year
SSS / PhilHealth / Pag-IBIG remittance month = the payroll month's name
BIR tax year   = the year of payment (RR 2-98 taxes compensation PAID)`}</Formula>
        <Note tone="warn">
          The payment dates themselves are not yet recorded against each period,
          so this correspondence rests on the naming convention rather than on
          evidence. Recording the actual pay date is an open item.
        </Note>
      </Section>
    </div>
  );
}

/* ── Dubai ─────────────────────────────────────────────────────────────── */

function Dubai() {
  return (
    <div className="space-y-4">
      <Section id="dxb-law" title="What the law requires">
        <p className={T_BODY}>
          The shortest part of this page, and the reason is the point:{" "}
          <strong className="text-zinc-200">there are no statutory deductions
          from an expatriate employee&rsquo;s pay in the UAE.</strong> No income
          tax, and no social insurance — the GPSSA scheme covers UAE and GCC
          nationals only. Nothing here corresponds to SSS, PhilHealth, Pag-IBIG
          or withholding tax.
        </p>
        <LawTable rows={[
          ["Federal Decree-Law No. 33 of 2021 (Regulating Labour Relations)",
           "Wages, working hours, overtime, leave, and end of service. The framework everything below sits in."],
          ["Cabinet Resolution No. 1 of 2022 (executive regulations)",
           "How the Decree-Law is applied, including Article 24 on imposing disciplinary penalties."],
          ["Federal Decree-Law No. 33 of 2021, Article 39",
           "The disciplinary penalties an employer may impose — a deduction from wages is one of them."],
          ["Wage Protection System (MOHRE)",
           "Wages are transferred through WPS. The run produces the figures that are filed."],
          ["No personal income tax; GPSSA applies to UAE/GCC nationals only",
           "Why the net is the gross plus additions less deductions, and nothing else."],
        ]} />
      </Section>

      <Section id="dxb-pay" title="Gross and net">
        <Formula>{`gross = basic + accommodation + transportation + other allowances
net   = gross + additions - deductions

additions   come from the attendance run (night premium) and from anything
            entered by hand for the cycle
deductions  come from the attendance run (below), plus loans and recurring
            items entered against the cycle

There is no statutory line on either side.`}</Formula>
      </Section>

      <Section id="dxb-rates" title="The two rates everything is measured in">
        <Formula>{`hourly = basic / 26 days / 8 hours
daily  = basic / 26 days

A part-timer engaged at an agreed hourly rate uses that rate instead.
Dividing their monthly figure by 26 x 8 produced a different rate every
month, because the figure is what they earned rather than what they agreed.`}</Formula>
      </Section>

      <Section id="dxb-night" title="Night premium — the one addition">
        <Formula>{`window  = 22:00 to 04:00 Gulf Standard Time (UTC+4, no daylight saving)
hours   = the part of the shift inside that window, counted minute by minute
premium = hours x hourly x 10%

Not paid on a public holiday: the holiday premium takes priority, and the
two do not stack.`}</Formula>
      </Section>

      <Section id="dxb-ded" title="Attendance deductions">
        <Formula>{`Late          more than 15 minutes: (late - 15) x hourly / 60
              and if 60 minutes or more remain after the grace,
              a further 10% of the daily rate

Three or more late instances in one cycle: a further 5% of monthly basic

Absent        unpaid absence, not annual leave: one daily rate
Undertime     minutes x hourly / 60
Missing punch one hour at the hourly rate, per incident
Break excess  more than 60 minutes beyond the scheduled break:
              excess minutes x hourly / 60`}</Formula>
        <Note tone="warn">
          The <strong>rates in this block are company policy, not statutory
          figures.</strong> The Decree-Law permits a deduction from wages as a
          disciplinary penalty (Article 39) and Cabinet Resolution No. 1 of 2022
          Article 24 sets out how penalties may be imposed; the 10% and 5% here
          are internal rules that sit inside that framework. They should be
          reviewed against the disciplinary procedure rather than treated as
          something the law fixes.
        </Note>
        <Note>
          Deductions only are suspended during a system go-live grace window —
          the first days of a rollout produced missing-punch fees for days nobody
          was being measured on. Night premium and every other addition is always
          paid: a grace period must never reduce what somebody earned.
        </Note>
      </Section>

      <Section id="dxb-not" title="What this page does not cover">
        <p className={T_BODY}>
          End-of-service gratuity, annual leave salary and air ticket entitlements
          are governed by the same Decree-Law but are not computed in the payroll
          run above. Leave salary is handled on its own screen.
        </p>
      </Section>
    </div>
  );
}

/* ── page ──────────────────────────────────────────────────────────────── */

export default function HowPayIsComputedPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [city, setCity] = useState<City>("manila");

  // Nothing is asserted about access until the browser has actually mounted:
  // the HTML is served from the edge cache with no localStorage, so deciding on
  // the first render shows every reader a denial they have not earned.
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (!mounted) return;
    const auth = getAuth();
    if (!auth || !canAccessPayrollAdmin(auth)) router.replace("/week");
  }, [mounted, router]);

  if (!mounted) return null;

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin/payroll"
            className="mb-2 inline-flex items-center gap-1.5 text-sm text-zinc-400 transition hover:text-violet-300">
            <ArrowLeft size={14} /> Payroll
          </Link>
          <h1 className={T_PAGE_TITLE}>How Pay Is Computed</h1>
          <p className={`${T_BODY} mt-1.5 max-w-2xl`}>
            Every formula on this page is the one the payroll engine applies, so
            a figure on a payslip can be checked here without reading code. The
            two cities follow different law and share almost nothing.
          </p>
        </div>
        <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-400">
          <Scale size={14} className="text-violet-400" />
          Reviewed 13 Sep 2026
        </div>
      </div>

      <div className={TAB_CONTAINER}>
        <button onClick={() => setCity("manila")}
          className={city === "manila" ? TAB_ACTIVE : TAB_INACTIVE}>
          Manila — Philippines
        </button>
        <button onClick={() => setCity("dubai")}
          className={city === "dubai" ? TAB_ACTIVE : TAB_INACTIVE}>
          Dubai — UAE
        </button>
      </div>

      {city === "manila" ? <Manila /> : <Dubai />}

      <div className={`${GLASS_CARD} p-5`}>
        <h2 className={`${T_SECTION} mb-2`}>Checking a payslip against this page</h2>
        <p className={T_BODY}>
          Every statutory line on a Manila payslip carries its own working in the
          note beside it — which schedule row, which base, and the arithmetic back
          to the figure. If a note and this page disagree, the note is what the
          engine did and this page is what it was supposed to do: report it.
        </p>
        <p className={`${T_CAPTION} mt-3 flex items-center gap-1.5`}>
          <ExternalLink size={12} />
          Sources: app/manila_payroll_engine.py, app/dubai_payroll_engine.py
        </p>
      </div>
    </div>
  );
}

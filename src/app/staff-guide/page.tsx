"use client";

import { useState } from "react";

const SECTIONS = [
  { id: "login",    label: "Login",      emoji: "🔑" },
  { id: "timein",   label: "Clock In",   emoji: "🟢" },
  { id: "breakin",  label: "Break In",   emoji: "☕" },
  { id: "breakout", label: "Break Out",  emoji: "🔔" },
  { id: "timeout",  label: "Clock Out",  emoji: "🔴" },
  { id: "myshift",  label: "My Shift",   emoji: "📅" },
  { id: "week",     label: "Week",       emoji: "🗓️" },
  { id: "calendar", label: "Calendar",   emoji: "📆" },
  { id: "request",  label: "Request",    emoji: "📝" },
  { id: "inbox",    label: "Inbox",      emoji: "📬" },
  { id: "expense",  label: "Expense",    emoji: "💳" },
  { id: "trouble",  label: "Help",       emoji: "🆘" },
];

type SectionId = (typeof SECTIONS)[number]["id"];

function Step({ num, children }: { num: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 items-start">
      <div className="shrink-0 w-8 h-8 rounded-full bg-violet-600 text-white flex items-center justify-center text-sm font-bold">
        {num}
      </div>
      <div className="pt-1 text-base leading-relaxed text-zinc-100">{children}</div>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-amber-950/40 border border-amber-500/30 px-4 py-3 text-sm text-amber-200 leading-relaxed">
      <span className="font-bold">⚠️ Note: </span>{children}
    </div>
  );
}

function Good({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-emerald-950/40 border border-emerald-500/30 px-4 py-3 text-sm text-emerald-200 leading-relaxed">
      <span className="font-bold">✅ Done: </span>{children}
    </div>
  );
}

function Info({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-zinc-800/60 border border-zinc-600/30 px-4 py-3 text-sm text-zinc-300 leading-relaxed">
      {children}
    </div>
  );
}

function SectionCard({ title, emoji, color, children }: {
  title: string; emoji: string; color: string; children: React.ReactNode;
}) {
  return (
    <div className={`rounded-2xl border ${color} bg-zinc-900/80 p-5 space-y-4`}>
      <h2 className="text-xl font-bold text-white flex items-center gap-2">
        <span className="text-2xl">{emoji}</span>
        {title}
      </h2>
      {children}
    </div>
  );
}

function Tag({ children, color = "bg-zinc-700 text-zinc-200" }: { children: React.ReactNode; color?: string }) {
  return <span className={`rounded px-2 py-0.5 font-mono text-xs ${color}`}>{children}</span>;
}

function RequestTypeRow({ label, desc }: { label: string; desc: string }) {
  return (
    <div className="flex gap-3 rounded-lg bg-zinc-800 px-3 py-2 items-start">
      <span className="text-violet-300 font-medium text-sm shrink-0 w-36">{label}</span>
      <span className="text-zinc-400 text-sm">{desc}</span>
    </div>
  );
}

export default function StaffGuidePage() {
  const [activeSection, setActiveSection] = useState<SectionId>("login");

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-zinc-950/95 backdrop-blur border-b border-zinc-800 px-4 py-3">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-lg font-bold text-white">📱 Staff Operation Guide</h1>
          <p className="text-xs text-zinc-400 mt-0.5">Sushi ZEN Workforce OS — Quick Reference</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="sticky top-[60px] z-20 bg-zinc-950/95 backdrop-blur border-b border-zinc-800 overflow-x-auto">
        <div className="flex gap-1 px-3 py-2 min-w-max">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all ${
                activeSection === s.id
                  ? "bg-violet-600 text-white"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
              }`}
            >
              <span className="text-base">{s.emoji}</span>
              <span>{s.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">

        {/* LOGIN */}
        {activeSection === "login" && (
          <SectionCard title="How to Log In" emoji="🔑" color="border-zinc-700">
            <div className="rounded-xl bg-violet-950/40 border border-violet-500/30 px-4 py-3 text-sm text-violet-200">
              <p className="font-bold mb-1">App URL</p>
              <p className="font-mono text-xs break-all">https://sushizen-shift-pwa.vercel.app</p>
            </div>
            <div className="space-y-3">
              <Step num={1}>Open the URL in your browser (iPhone → Safari, Android → Chrome)</Step>
              <Step num={2}>Select your name from the list</Step>
              <Step num={3}>Enter your 4-digit PIN code</Step>
              <Step num={4}>Tap the <Tag color="bg-violet-700 text-violet-100">Login</Tag> button</Step>
            </div>
            <Good>The home screen appears and you can use the app.</Good>
            <Note>If you forget your PIN, contact your manager to reset it.</Note>
            <div className="rounded-xl bg-zinc-800/60 px-4 py-3">
              <p className="text-sm font-bold text-zinc-200 mb-2">💡 Add to Home Screen (iPhone)</p>
              <ol className="text-sm text-zinc-300 space-y-1 list-decimal list-inside">
                <li>Open the app in Safari</li>
                <li>Tap the Share button (square with arrow) at the bottom</li>
                <li>Tap &quot;Add to Home Screen&quot;</li>
                <li>Tap &quot;Add&quot;</li>
              </ol>
            </div>
          </SectionCard>
        )}

        {/* CLOCK IN */}
        {activeSection === "timein" && (
          <SectionCard title="Clock In (Start of Shift)" emoji="🟢" color="border-emerald-800">
            <Info>Always clock in first when you arrive at work.</Info>
            <div className="space-y-3">
              <Step num={1}>Tap <Tag>Attendance</Tag> in the left menu</Step>
              <Step num={2}>
                Tap <Tag color="bg-blue-700 text-blue-100">📍 Get My Location</Tag>
                <div className="mt-2 rounded-lg bg-zinc-800 px-3 py-2 text-sm">
                  → When asked &quot;Allow location access?&quot; tap <span className="text-green-400 font-bold">Allow</span>
                </div>
              </Step>
              <Step num={3}>Tap <Tag color="bg-emerald-700 text-emerald-100">🟢 Clock In</Tag></Step>
              <Step num={4}>Authenticate with fingerprint or face (Face ID / Touch ID)</Step>
            </div>
            <Good>&quot;Clocked in ✓&quot; appears — clock-in complete.</Good>
            <Note>You must be at or near the store. If GPS is weak indoors, move closer to a window and try again.</Note>
          </SectionCard>
        )}

        {/* BREAK IN */}
        {activeSection === "breakin" && (
          <SectionCard title="Break In (Start of Break)" emoji="☕" color="border-sky-800">
            <Info>Always tap Break In when your break starts.</Info>
            <div className="space-y-3">
              <Step num={1}>Tap <Tag>Attendance</Tag> in the left menu</Step>
              <Step num={2}>
                Tap the light-blue <Tag color="bg-sky-700 text-sky-100">☕ Break In</Tag> button
                <div className="mt-1 text-sm text-zinc-400">This button only appears when you are clocked in.</div>
              </Step>
              <Step num={3}>Authenticate with fingerprint or face</Step>
            </div>
            <Good>&quot;Break started ✓&quot; — break is now recorded.</Good>
            <Note>Keep your break to <span className="font-bold text-amber-300">50 minutes or less</span>. A push notification is sent if you exceed 50 minutes.</Note>
          </SectionCard>
        )}

        {/* BREAK OUT */}
        {activeSection === "breakout" && (
          <SectionCard title="Break Out (End of Break)" emoji="🔔" color="border-amber-800">
            <Info>Always tap Break Out when your break ends.</Info>
            <div className="space-y-3">
              <Step num={1}>Tap <Tag>Attendance</Tag> in the left menu</Step>
              <Step num={2}>
                Tap the orange <Tag color="bg-amber-700 text-amber-100">⏹ Break Out</Tag> button
                <div className="mt-1 text-sm text-zinc-400">This button only appears while you are on break.</div>
              </Step>
              <Step num={3}>Authenticate with fingerprint or face</Step>
            </div>
            <Good>&quot;Break ended ✓&quot; — break is closed.</Good>
            <Note>You cannot clock out while on break. Always tap Break Out before clocking out.</Note>
          </SectionCard>
        )}

        {/* CLOCK OUT */}
        {activeSection === "timeout" && (
          <SectionCard title="Clock Out (End of Shift)" emoji="🔴" color="border-red-800">
            <Info>Always clock out before leaving work.</Info>
            <Note>The Clock Out button is hidden while on break — tap <span className="font-bold text-amber-300">Break Out</span> first.</Note>
            <div className="space-y-3">
              <Step num={1}>Tap <Tag>Attendance</Tag> in the left menu</Step>
              <Step num={2}>Tap <Tag color="bg-red-700 text-red-100">🔴 Clock Out</Tag></Step>
              <Step num={3}>Authenticate with fingerprint or face</Step>
            </div>
            <Good>&quot;Clocked out ✓&quot; — clock-out complete.</Good>
            <div className="rounded-xl bg-zinc-800/60 px-4 py-3">
              <p className="text-sm font-bold text-zinc-200 mb-2">📋 Daily Flow</p>
              <div className="space-y-2">
                {[
                  { n: 1, bg: "#15803d", text: "Arrive → Clock In (green)" },
                  { n: 2, bg: "#0369a1", text: "Break starts → Break In (blue)" },
                  { n: 3, bg: "#b45309", text: "Break ends → Break Out (orange)" },
                  { n: 4, bg: "#b91c1c", text: "Leave → Clock Out (red)" },
                ].map(({ n, bg, text }) => (
                  <div key={n} className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: bg }}>{n}</div>
                    <span className="text-zinc-300 text-sm">{text}</span>
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>
        )}

        {/* MY SHIFT */}
        {activeSection === "myshift" && (
          <SectionCard title="My Shift" emoji="📅" color="border-indigo-800">
            <Info>View your own upcoming and past shifts. Check your schedule here before each work day.</Info>
            <div className="space-y-3">
              <Step num={1}>Tap <Tag>My Shift</Tag> in the left menu</Step>
              <Step num={2}>Your shifts for the current week are shown as cards — each card shows the date, branch, and shift time</Step>
              <Step num={3}>Swipe or use the arrows to move to the next or previous week</Step>
            </div>
            <div className="rounded-xl bg-indigo-950/30 border border-indigo-500/20 px-4 py-3 space-y-2">
              <p className="text-sm font-bold text-indigo-300">What you can see:</p>
              <ul className="text-sm text-zinc-300 space-y-1 list-disc list-inside">
                <li>Your assigned shift dates and times</li>
                <li>Which branch / location you are assigned to</li>
                <li>Rest days (no shift card shown)</li>
              </ul>
            </div>
            <Note>You cannot edit shifts here. To request a change, use the <span className="font-bold text-amber-300">Request</span> page.</Note>
          </SectionCard>
        )}

        {/* WEEK */}
        {activeSection === "week" && (
          <SectionCard title="Week — Full Roster" emoji="🗓️" color="border-cyan-800">
            <Info>See the complete shift schedule for all staff at your branch for the current week.</Info>
            <div className="space-y-3">
              <Step num={1}>Tap <Tag>Week</Tag> in the left menu</Step>
              <Step num={2}>A grid shows every staff member and their shift for each day of the week</Step>
              <Step num={3}>Use the week selector at the top to view other weeks</Step>
            </div>
            <div className="rounded-xl bg-cyan-950/30 border border-cyan-500/20 px-4 py-3 space-y-2">
              <p className="text-sm font-bold text-cyan-300">How to read the roster:</p>
              <ul className="text-sm text-zinc-300 space-y-1 list-disc list-inside">
                <li>Each row = one staff member</li>
                <li>Each column = one day of the week</li>
                <li>Colored cells = working that day (shows shift time)</li>
                <li>Empty / gray cell = rest day</li>
                <li>Your own row is highlighted</li>
              </ul>
            </div>
            <Note>This is a read-only view. Only managers can publish or edit the roster.</Note>
          </SectionCard>
        )}

        {/* CALENDAR */}
        {activeSection === "calendar" && (
          <SectionCard title="Calendar" emoji="📆" color="border-teal-800">
            <Info>A monthly calendar view of your shifts, public holidays, and store events.</Info>
            <div className="space-y-3">
              <Step num={1}>Tap <Tag>Calendar</Tag> in the left menu</Step>
              <Step num={2}>The current month is shown — days with shifts are highlighted</Step>
              <Step num={3}>Tap any day to see the details for that day</Step>
              <Step num={4}>Use the left / right arrows to navigate between months</Step>
            </div>
            <div className="rounded-xl bg-teal-950/30 border border-teal-500/20 px-4 py-3 space-y-2">
              <p className="text-sm font-bold text-teal-300">Color guide:</p>
              <ul className="text-sm text-zinc-300 space-y-1 list-disc list-inside">
                <li><span className="text-violet-300 font-medium">Purple dot</span> — you have a shift that day</li>
                <li><span className="text-zinc-400 font-medium">Gray</span> — rest day or no shift</li>
                <li><span className="text-amber-300 font-medium">Amber / orange</span> — public holiday or special event</li>
              </ul>
            </div>
          </SectionCard>
        )}

        {/* REQUEST */}
        {activeSection === "request" && (
          <SectionCard title="Request (Shift & Leave)" emoji="📝" color="border-purple-800">
            <Info>Submit requests for shift changes, days off, swaps, or to report an absence. Your manager reviews and approves or declines each request.</Info>
            <div className="space-y-3">
              <Step num={1}>Tap <Tag>Request</Tag> in the left menu</Step>
              <Step num={2}>Choose the request type from the dropdown</Step>
              <Step num={3}>Fill in the date and any required details</Step>
              <Step num={4}>Add a reason (optional but recommended)</Step>
              <Step num={5}>Tap <Tag color="bg-violet-700 text-violet-100">Submit Request</Tag></Step>
            </div>
            <Good>Request submitted! You will see it in your Request History below the form. Your manager will review it and the result will appear in your Inbox.</Good>

            <div className="space-y-2">
              <p className="text-sm font-bold text-zinc-200">Request types:</p>
              <RequestTypeRow label="Time Change" desc="Ask to change your shift start or end time" />
              <RequestTypeRow label="Day Off" desc="Request a day off (unpaid)" />
              <RequestTypeRow label="Absence" desc="Report that you were absent (e.g. emergency)" />
              <RequestTypeRow label="Shift Swap" desc="Swap your shift with another staff member — enter their name and the swap details" />
              <RequestTypeRow label="Paid Leave" desc="Use paid leave (SL / VL) for a day" />
              <RequestTypeRow label="Vacation" desc="Request a multi-day vacation period" />
              <RequestTypeRow label="Overtime" desc="Request pre-approval to work overtime" />
              <RequestTypeRow label="Other" desc="Any other request — describe it in the reason field" />
            </div>
            <Note>Requests are not automatically approved. Wait for your manager to review and check your Inbox for the result.</Note>
          </SectionCard>
        )}

        {/* INBOX */}
        {activeSection === "inbox" && (
          <SectionCard title="Inbox" emoji="📬" color="border-zinc-700">
            <Info>Messages from HQ, expense request results, and shift request replies all appear here.</Info>
            <div className="space-y-3">
              <Step num={1}>Tap <Tag>📬 Inbox</Tag> in the left menu</Step>
              <Step num={2}>Tap <Tag color="bg-violet-700 text-violet-100">Refresh</Tag> to load the latest messages</Step>
              <Step num={3}>Read the message — unread messages have a colored left border</Step>
              <Step num={4}>Tap <Tag>Mark read</Tag> when done</Step>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-bold text-zinc-200">Border color meaning:</p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-3 rounded-lg border border-violet-500/30 bg-violet-950/20 px-3 py-2">
                  <div className="w-1 h-6 rounded-full bg-violet-500 shrink-0" />
                  <span className="text-zinc-300 text-sm">Purple — shift request reply from manager</span>
                </div>
                <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2">
                  <div className="w-1 h-6 rounded-full bg-amber-500 shrink-0" />
                  <span className="text-zinc-300 text-sm">Amber — expense request submitted / pending</span>
                </div>
                <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-950/20 px-3 py-2">
                  <div className="w-1 h-6 rounded-full bg-emerald-500 shrink-0" />
                  <span className="text-zinc-300 text-sm">Green — expense approved or paid</span>
                </div>
                <div className="flex items-center gap-3 rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-2">
                  <div className="w-1 h-6 rounded-full bg-red-500 shrink-0" />
                  <span className="text-zinc-300 text-sm">Red — expense rejected</span>
                </div>
              </div>
            </div>
          </SectionCard>
        )}

        {/* EXPENSE */}
        {activeSection === "expense" && (
          <SectionCard title="Expense Reimbursement" emoji="💳" color="border-violet-800">

            <Info>
              If you paid for something out of your own pocket for work, you can request the company to pay you back. This is called an <span className="font-bold text-white">expense reimbursement</span>. Your manager will review and approve or decline each request.
            </Info>

            {/* What you can claim */}
            <div>
              <p className="text-sm font-bold text-zinc-200 mb-2">What you can submit:</p>
              <div className="grid grid-cols-1 gap-1.5">
                {[
                  { cat: "Ingredients",  emoji: "🥩", ex: "Items you bought for the store because we ran out" },
                  { cat: "Transport",    emoji: "🚌", ex: "Bus, train, taxi fare for work travel (not commuting)" },
                  { cat: "Uniform",      emoji: "👕", ex: "Uniform items purchased on instruction from management" },
                  { cat: "Equipment",    emoji: "🔧", ex: "Small tools or supplies needed for your job" },
                  { cat: "Mobile",       emoji: "📱", ex: "Work-related phone expenses (e.g. data used for work calls)" },
                  { cat: "Other",        emoji: "📋", ex: "Anything else — explain clearly in the description" },
                ].map(({ cat, emoji, ex }) => (
                  <div key={cat} className="flex gap-3 rounded-lg bg-zinc-800 px-3 py-2.5 items-start">
                    <span className="text-xl shrink-0">{emoji}</span>
                    <div>
                      <span className="text-violet-300 font-semibold text-sm">{cat}</span>
                      <p className="text-zinc-400 text-xs mt-0.5">{ex}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Note>
              Regular daily commuting costs are <span className="font-bold">NOT</span> reimbursable. Only submit expenses that were directly required for your work duties.
            </Note>

            {/* How to submit */}
            <div>
              <p className="text-sm font-bold text-zinc-200 mb-3">How to submit:</p>
              <div className="space-y-3">
                <Step num={1}>
                  Tap <Tag>Expense Reimbursement</Tag> in the left menu
                </Step>
                <Step num={2}>
                  Select the <span className="font-bold text-violet-300">Category</span> that best fits your expense from the dropdown
                </Step>
                <Step num={3}>
                  Enter the <span className="font-bold text-violet-300">Amount</span>
                  <div className="mt-1.5 flex gap-2">
                    <span className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300">Dubai → AED</span>
                    <span className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300">Manila → PHP</span>
                  </div>
                </Step>
                <Step num={4}>
                  Select the <span className="font-bold text-violet-300">Expense Date</span> — the day you actually paid, not today
                </Step>
                <Step num={5}>
                  Write a clear <span className="font-bold text-violet-300">Description</span>
                  <div className="mt-1.5 rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-300">
                    <p className="text-xs text-zinc-400 mb-1">Example:</p>
                    <p className="italic text-zinc-300">&quot;Bought 2 kg salmon from supermarket because we ran out before closing — receipt available&quot;</p>
                  </div>
                </Step>
                <Step num={6}>
                  Tap <Tag color="bg-violet-700 text-violet-100">Submit Request</Tag>
                </Step>
              </div>
            </div>

            <Good>Request submitted! You will see it in your request history below the form. Check your Inbox for the manager&apos;s decision.</Good>

            {/* Status guide */}
            <div>
              <p className="text-sm font-bold text-zinc-200 mb-2">Request status meanings:</p>
              <div className="space-y-1.5">
                {[
                  { color: "bg-amber-500",  label: "Pending",  desc: "Waiting for your manager to review" },
                  { color: "bg-emerald-500",label: "Approved", desc: "Manager approved — will be included in your next payroll" },
                  { color: "bg-blue-500",   label: "Paid",     desc: "The amount has been added to your salary" },
                  { color: "bg-red-500",    label: "Rejected", desc: "Not approved — check your Inbox for the reason" },
                ].map(({ color, label, desc }) => (
                  <div key={label} className="flex items-center gap-3 rounded-lg bg-zinc-800 px-3 py-2">
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold text-white ${color}`}>{label}</span>
                    <span className="text-zinc-300 text-sm">{desc}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Tips */}
            <div className="rounded-xl bg-indigo-950/40 border border-indigo-500/30 px-4 py-3 space-y-2">
              <p className="text-sm font-bold text-indigo-300">💡 Tips for faster approval</p>
              <ul className="text-sm text-zinc-300 space-y-1.5 list-disc list-inside">
                <li>Keep your receipt — your manager may ask for a photo of it</li>
                <li>Submit as soon as possible after the expense (same day is best)</li>
                <li>One expense per submission — do not combine multiple items into one request</li>
                <li>Write a specific description — vague reasons are often declined</li>
              </ul>
            </div>

            <Note>
              If your request is rejected, the reason will appear in your <span className="font-bold text-amber-300">Inbox</span>. You may correct and resubmit if needed.
            </Note>

          </SectionCard>
        )}

        {/* HELP */}
        {activeSection === "trouble" && (
          <SectionCard title="Troubleshooting" emoji="🆘" color="border-zinc-700">
            <div className="space-y-3">
              {[
                {
                  color: "text-red-300",
                  title: "❌ Fingerprint / Face ID not working",
                  body: "First-time use requires device registration. On the Attendance page tap Register This Device and follow the prompts.",
                },
                {
                  color: "text-amber-300",
                  title: "📍 Cannot get GPS location",
                  body: "① Move near a window or go outside and try again.\n② Phone Settings → Privacy → Location Services → ON.\n③ Allow location for this browser site.",
                },
                {
                  color: "text-emerald-300",
                  title: "⏰ Forgot to clock in / out",
                  body: "Report it to your manager. They can correct the record. You cannot edit it yourself.",
                },
                {
                  color: "text-violet-300",
                  title: "🔑 Forgot PIN",
                  body: "Contact your manager or HR to have your PIN reset.",
                },
                {
                  color: "text-sky-300",
                  title: "📱 Page not loading",
                  body: "① Pull down to refresh.\n② Close the browser and reopen.\n③ Log out and log back in.",
                },
                {
                  color: "text-pink-300",
                  title: "📝 Request not appearing",
                  body: "Tap the Refresh button on the Request page to reload. If still missing, submit again or contact your manager.",
                },
              ].map(({ color, title, body }) => (
                <div key={title} className="rounded-xl bg-zinc-800/60 px-4 py-3 space-y-2">
                  <p className={`text-sm font-bold ${color}`}>{title}</p>
                  <div className="text-sm text-zinc-300 leading-relaxed">
                    {body.split("\n").map((line, i) => <p key={i}>{line}</p>)}
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded-xl bg-violet-950/40 border border-violet-500/30 px-4 py-3 mt-2">
              <p className="text-sm font-bold text-violet-200 mb-1">This guide URL</p>
              <p className="text-xs font-mono text-violet-300 break-all">https://sushizen-shift-pwa.vercel.app/staff-guide</p>
              <p className="text-xs text-zinc-400 mt-1">Bookmark this page for quick access.</p>
            </div>
          </SectionCard>
        )}
      </div>

      <div className="text-center py-8 text-xs text-zinc-600">
        Sushi ZEN Workforce OS — Staff Guide v1.1
      </div>
    </div>
  );
}

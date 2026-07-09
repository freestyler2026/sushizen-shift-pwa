"use client";

import { useState } from "react";

const SECTIONS = [
  { id: "login",    label: "Login",      emoji: "🔑" },
  { id: "timein",   label: "Clock In",   emoji: "🟢" },
  { id: "breakin",  label: "Break In",   emoji: "☕" },
  { id: "breakout", label: "Break Out",  emoji: "🔔" },
  { id: "timeout",  label: "Clock Out",  emoji: "🔴" },
  { id: "expense",  label: "Expense",    emoji: "💳" },
  { id: "inbox",    label: "Inbox",      emoji: "📬" },
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

function SectionCard({
  title, emoji, color, children,
}: {
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

function CategoryBadge({ label, desc }: { label: string; desc: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-zinc-800 px-3 py-2">
      <span className="text-violet-300 font-mono text-sm">{label}</span>
      <span className="text-zinc-400 text-sm">— {desc}</span>
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
              <Step num={1}>Open the URL in your browser (Safari or Chrome)</Step>
              <Step num={2}>Select your name from the list</Step>
              <Step num={3}>Enter your 4-digit PIN code</Step>
              <Step num={4}>Tap the <span className="rounded bg-violet-700 px-2 py-0.5 font-mono text-sm">Login</span> button</Step>
            </div>
            <Good>The home screen appears and you can use the app.</Good>
            <Note>If you forget your PIN, contact your manager to reset it.</Note>

            <div className="rounded-xl bg-zinc-800/60 px-4 py-3 mt-2">
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
            <div className="rounded-xl bg-emerald-950/40 border border-emerald-500/20 px-4 py-3 text-sm text-emerald-200">
              Always clock in first when you arrive at work.
            </div>
            <div className="space-y-3">
              <Step num={1}>
                Tap <span className="rounded bg-zinc-700 px-2 py-0.5 font-mono text-sm">Attendance</span> in the bottom menu
              </Step>
              <Step num={2}>
                Tap <span className="rounded bg-blue-700 px-2 py-0.5 font-mono text-sm">📍 Get My Location</span>
                <div className="mt-2 rounded-lg bg-zinc-800 px-3 py-2 text-sm">
                  → When asked &quot;Allow location access?&quot; tap <span className="text-green-400 font-bold">Allow</span>
                </div>
              </Step>
              <Step num={3}>
                Tap the <span className="rounded bg-emerald-700 px-2 py-0.5 font-mono text-sm">🟢 Clock In</span> button
              </Step>
              <Step num={4}>
                Authenticate with fingerprint or face (Face ID / Touch ID on iPhone, fingerprint sensor on Android)
              </Step>
            </div>
            <Good>&quot;Clocked in ✓&quot; message appears — clock-in complete.</Good>
            <Note>
              You must be at or near the store. If GPS is weak indoors, move closer to a window and try again.
            </Note>
          </SectionCard>
        )}

        {/* BREAK IN */}
        {activeSection === "breakin" && (
          <SectionCard title="Break In (Start of Break)" emoji="☕" color="border-sky-800">
            <div className="rounded-xl bg-sky-950/40 border border-sky-500/20 px-4 py-3 text-sm text-sky-200">
              Always tap Break In when your break starts.
            </div>
            <div className="space-y-3">
              <Step num={1}>
                Tap <span className="rounded bg-zinc-700 px-2 py-0.5 font-mono text-sm">Attendance</span> in the bottom menu
              </Step>
              <Step num={2}>
                Tap the light-blue <span className="rounded bg-sky-700 px-2 py-0.5 font-mono text-sm">☕ Break In</span> button
                <div className="mt-1 text-sm text-zinc-400">
                  This button only appears when you are clocked in.
                </div>
              </Step>
              <Step num={3}>Authenticate with fingerprint or face</Step>
            </div>
            <Good>&quot;Break started ✓&quot; — break is now recorded.</Good>
            <Note>
              Keep your break to <span className="font-bold text-amber-300">50 minutes or less</span>.
              A push notification will be sent if you exceed 50 minutes.
            </Note>
          </SectionCard>
        )}

        {/* BREAK OUT */}
        {activeSection === "breakout" && (
          <SectionCard title="Break Out (End of Break)" emoji="🔔" color="border-amber-800">
            <div className="rounded-xl bg-amber-950/40 border border-amber-500/20 px-4 py-3 text-sm text-amber-200">
              Always tap Break Out when your break ends.
            </div>
            <div className="space-y-3">
              <Step num={1}>
                Tap <span className="rounded bg-zinc-700 px-2 py-0.5 font-mono text-sm">Attendance</span> in the bottom menu
              </Step>
              <Step num={2}>
                Tap the orange <span className="rounded bg-amber-700 px-2 py-0.5 font-mono text-sm">⏹ Break Out</span> button
                <div className="mt-1 text-sm text-zinc-400">
                  This button only appears while you are on break.
                </div>
              </Step>
              <Step num={3}>Authenticate with fingerprint or face</Step>
            </div>
            <Good>&quot;Break ended ✓&quot; — break is closed.</Good>
            <Note>
              You cannot clock out while on break. Always tap Break Out before clocking out at the end of your shift.
            </Note>
          </SectionCard>
        )}

        {/* CLOCK OUT */}
        {activeSection === "timeout" && (
          <SectionCard title="Clock Out (End of Shift)" emoji="🔴" color="border-red-800">
            <div className="rounded-xl bg-red-950/40 border border-red-500/20 px-4 py-3 text-sm text-red-200">
              Always clock out before leaving work.
            </div>
            <Note>
              The Clock Out button is hidden while you are on break.
              Tap <span className="font-bold text-amber-300">Break Out</span> first, then clock out.
            </Note>
            <div className="space-y-3">
              <Step num={1}>
                Tap <span className="rounded bg-zinc-700 px-2 py-0.5 font-mono text-sm">Attendance</span> in the bottom menu
              </Step>
              <Step num={2}>
                Tap the red <span className="rounded bg-red-700 px-2 py-0.5 font-mono text-sm">🔴 Clock Out</span> button
              </Step>
              <Step num={3}>Authenticate with fingerprint or face</Step>
            </div>
            <Good>&quot;Clocked out ✓&quot; — clock-out complete.</Good>

            <div className="rounded-xl bg-zinc-800/60 px-4 py-3">
              <p className="text-sm font-bold text-zinc-200 mb-2">📋 Daily Flow Summary</p>
              <div className="space-y-2">
                {[
                  { n: 1, bg: "#15803d", text: "Arrive → Clock In (green button)" },
                  { n: 2, bg: "#0369a1", text: "Break starts → Break In (blue button)" },
                  { n: 3, bg: "#b45309", text: "Break ends → Break Out (orange button)" },
                  { n: 4, bg: "#b91c1c", text: "Leave → Clock Out (red button)" },
                ].map(({ n, bg, text }) => (
                  <div key={n} className="flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                      style={{ background: bg }}
                    >
                      {n}
                    </div>
                    <span className="text-zinc-300 text-sm">{text}</span>
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>
        )}

        {/* EXPENSE */}
        {activeSection === "expense" && (
          <SectionCard title="Expense Reimbursement" emoji="💳" color="border-violet-800">
            <div className="rounded-xl bg-violet-950/40 border border-violet-500/20 px-4 py-3 text-sm text-violet-200">
              Submit work-related expenses for reimbursement. HQ will review your request.
            </div>
            <div className="space-y-3">
              <Step num={1}>
                Tap <span className="rounded bg-zinc-700 px-2 py-0.5 font-mono text-sm">Expense Reimbursement</span> in the menu
              </Step>
              <Step num={2}>
                <div>
                  Select a category:
                  <div className="mt-2 grid grid-cols-1 gap-1.5">
                    <CategoryBadge label="Ingredients"  desc="food / ingredients purchased" />
                    <CategoryBadge label="Transport"    desc="transportation costs" />
                    <CategoryBadge label="Uniform"      desc="uniform items" />
                    <CategoryBadge label="Equipment"    desc="tools / equipment" />
                    <CategoryBadge label="Mobile"       desc="mobile phone expenses" />
                    <CategoryBadge label="Other"        desc="anything else" />
                  </div>
                </div>
              </Step>
              <Step num={3}>Enter the amount (Dubai → AED / Manila → PHP)</Step>
              <Step num={4}>Select the date the expense occurred</Step>
              <Step num={5}>Add a description if needed (optional)</Step>
              <Step num={6}>
                Tap <span className="rounded bg-violet-700 px-2 py-0.5 font-mono text-sm">Submit Request</span>
              </Step>
            </div>
            <Good>
              Request submitted! You will receive a confirmation in your Inbox.
              The review result (Approved / Rejected / Paid) will also appear there.
            </Good>
            <Note>
              Submit one expense per request. If you have multiple expenses, submit them separately.
            </Note>
          </SectionCard>
        )}

        {/* INBOX */}
        {activeSection === "inbox" && (
          <SectionCard title="Inbox" emoji="📬" color="border-zinc-700">
            <div className="rounded-xl bg-zinc-800/60 px-4 py-3 text-sm text-zinc-300">
              Messages from HQ and expense request results appear here.
            </div>
            <div className="space-y-3">
              <Step num={1}>
                Tap <span className="rounded bg-zinc-700 px-2 py-0.5 font-mono text-sm">📬 Inbox</span> in the menu
              </Step>
              <Step num={2}>
                Tap <span className="rounded bg-violet-700 px-2 py-0.5 font-mono text-sm">Refresh</span> to load the latest messages
              </Step>
              <Step num={3}>Read the message content</Step>
              <Step num={4}>
                Tap <span className="rounded bg-zinc-700 px-2 py-0.5 font-mono text-sm">Mark read</span> to mark it as read
              </Step>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-bold text-zinc-200">Expense request statuses:</p>
              {[
                { status: "Pending",  color: "amber",   label: "Under review — please wait" },
                { status: "Approved", color: "emerald", label: "Your request was approved" },
                { status: "Paid",     color: "emerald", label: "Payment has been processed" },
                { status: "Rejected", color: "red",     label: "Request was declined — check the note for reason" },
              ].map(({ status, color, label }) => (
                <div
                  key={status}
                  className={`flex items-center gap-3 rounded-lg bg-${color}-950/30 border border-${color}-500/20 px-3 py-2`}
                >
                  <span className={`text-${color}-400 font-bold text-sm w-20 shrink-0`}>{status}</span>
                  <span className="text-zinc-400 text-sm">{label}</span>
                </div>
              ))}
            </div>
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
                  body: (
                    <>
                      First-time use requires device registration. On the Attendance page tap{" "}
                      <span className="text-violet-300 font-mono text-xs">Register This Device</span>.
                    </>
                  ),
                },
                {
                  color: "text-amber-300",
                  title: "📍 Cannot get GPS location",
                  body: (
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Move near a window or go outside and try again</li>
                      <li>Go to phone Settings → Privacy → Location Services → turn ON</li>
                      <li>Allow location access for this browser/site</li>
                    </ol>
                  ),
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
                  body: (
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Pull down to refresh the page</li>
                      <li>Close the browser and reopen it</li>
                      <li>Log out and log back in</li>
                    </ol>
                  ),
                },
              ].map(({ color, title, body }) => (
                <div key={title} className="rounded-xl bg-zinc-800/60 px-4 py-3 space-y-2">
                  <p className={`text-sm font-bold ${color}`}>{title}</p>
                  <div className="text-sm text-zinc-300 leading-relaxed">{body}</div>
                </div>
              ))}
            </div>

            <div className="rounded-xl bg-violet-950/40 border border-violet-500/30 px-4 py-3 mt-2">
              <p className="text-sm font-bold text-violet-200 mb-1">This guide URL</p>
              <p className="text-xs font-mono text-violet-300 break-all">
                https://sushizen-shift-pwa.vercel.app/staff-guide
              </p>
              <p className="text-xs text-zinc-400 mt-1">Bookmark this page for quick access.</p>
            </div>
          </SectionCard>
        )}
      </div>

      <div className="text-center py-8 text-xs text-zinc-600">
        Sushi ZEN Workforce OS — Staff Guide v1.0
      </div>
    </div>
  );
}

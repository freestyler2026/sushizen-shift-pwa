"use client";

import { useState } from "react";

const SECTIONS = [
  { id: "login", label: "ログイン", emoji: "🔑" },
  { id: "timein", label: "タイムイン", emoji: "🟢" },
  { id: "breakin", label: "ブレイクイン", emoji: "☕" },
  { id: "breakout", label: "ブレイクアウト", emoji: "🔔" },
  { id: "timeout", label: "タイムアウト", emoji: "🔴" },
  { id: "expense", label: "経費申請", emoji: "💳" },
  { id: "inbox", label: "受信箱", emoji: "📬" },
  { id: "trouble", label: "困ったとき", emoji: "🆘" },
];

type SectionId = (typeof SECTIONS)[number]["id"];

function Step({
  num,
  children,
}: {
  num: number;
  children: React.ReactNode;
}) {
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
      <span className="font-bold">⚠️ 注意：</span> {children}
    </div>
  );
}

function Good({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-emerald-950/40 border border-emerald-500/30 px-4 py-3 text-sm text-emerald-200 leading-relaxed">
      <span className="font-bold">✅ 完了：</span> {children}
    </div>
  );
}

function SectionCard({
  title,
  emoji,
  color,
  children,
}: {
  title: string;
  emoji: string;
  color: string;
  children: React.ReactNode;
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

function CategoryBadge({ label, jp }: { label: string; jp: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-zinc-800 px-3 py-2">
      <span className="text-violet-300 font-mono text-sm">{label}</span>
      <span className="text-zinc-400 text-sm">→ {jp}</span>
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
          <h1 className="text-lg font-bold text-white">📱 スタッフ操作マニュアル</h1>
          <p className="text-xs text-zinc-400 mt-0.5">Sushi ZEN Workforce OS — 日本語ガイド</p>
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
        {/* ログイン */}
        {activeSection === "login" && (
          <SectionCard title="ログイン方法" emoji="🔑" color="border-zinc-700">
            <div className="rounded-xl bg-violet-950/40 border border-violet-500/30 px-4 py-3 text-sm text-violet-200">
              <p className="font-bold mb-1">アプリURL</p>
              <p className="font-mono text-xs break-all">https://sushizen-shift-pwa.vercel.app</p>
            </div>
            <div className="space-y-3">
              <Step num={1}>スマートフォンのブラウザ（Safari または Chrome）でURLを開く</Step>
              <Step num={2}>自分の名前をリストから選ぶ</Step>
              <Step num={3}>PINコード（4桁の数字）を入力する</Step>
              <Step num={4}>「Login」ボタンをタップする</Step>
            </div>
            <Good>ホーム画面にアイコンが表示され、アプリが使えるようになります</Good>
            <Note>PINコードを忘れた場合は、マネージャーに連絡してください</Note>

            <div className="rounded-xl bg-zinc-800/60 px-4 py-3 mt-2">
              <p className="text-sm font-bold text-zinc-200 mb-2">💡 ホーム画面に追加する方法（iPhone）</p>
              <ol className="text-sm text-zinc-300 space-y-1 list-decimal list-inside">
                <li>Safariでアプリを開く</li>
                <li>画面下の「共有」ボタン（四角に矢印）をタップ</li>
                <li>「ホーム画面に追加」をタップ</li>
                <li>「追加」をタップ</li>
              </ol>
            </div>
          </SectionCard>
        )}

        {/* タイムイン */}
        {activeSection === "timein" && (
          <SectionCard title="タイムイン（出勤打刻）" emoji="🟢" color="border-emerald-800">
            <div className="rounded-xl bg-emerald-950/40 border border-emerald-500/20 px-4 py-3 text-sm text-emerald-200">
              出勤したら必ず最初にタイムインをしてください。
            </div>
            <div className="space-y-3">
              <Step num={1}>
                画面下のメニューから{" "}
                <span className="rounded bg-zinc-700 px-2 py-0.5 font-mono text-sm">Attendance</span>{" "}
                をタップする
              </Step>
              <Step num={2}>
                <div>
                  <span className="rounded bg-blue-700 px-2 py-0.5 font-mono text-sm">📍 Get My Location</span>{" "}
                  ボタンをタップする
                  <div className="mt-2 rounded-lg bg-zinc-800 px-3 py-2 text-sm">
                    → 「○○が現在地の使用を求めています」と聞かれたら{" "}
                    <span className="text-green-400 font-bold">「許可」または「OK」</span> をタップ
                  </div>
                </div>
              </Step>
              <Step num={3}>
                <span className="rounded bg-emerald-700 px-2 py-0.5 font-mono text-sm">🟢 Clock In</span>{" "}
                ボタンをタップする
              </Step>
              <Step num={4}>
                指紋認証または顔認証の画面が出たら、指を当てるか画面を見る
                <div className="mt-2 text-sm text-zinc-400">
                  （iPhoneならFace ID / Touch ID、Androidなら指紋センサー）
                </div>
              </Step>
            </div>
            <Good>「Clocked in ✓」と表示されれば出勤打刻完了です</Good>
            <Note>
              店の中または近くにいないと打刻できません。
              建物の中でGPSが弱い場合は窓の近くで試してください。
            </Note>
          </SectionCard>
        )}

        {/* ブレイクイン */}
        {activeSection === "breakin" && (
          <SectionCard title="ブレイクイン（休憩開始）" emoji="☕" color="border-sky-800">
            <div className="rounded-xl bg-sky-950/40 border border-sky-500/20 px-4 py-3 text-sm text-sky-200">
              休憩に入るときは必ずブレイクインをしてください。
            </div>
            <div className="space-y-3">
              <Step num={1}>
                画面下のメニューから{" "}
                <span className="rounded bg-zinc-700 px-2 py-0.5 font-mono text-sm">Attendance</span>{" "}
                をタップする
              </Step>
              <Step num={2}>
                水色の{" "}
                <span className="rounded bg-sky-700 px-2 py-0.5 font-mono text-sm">☕ Break In</span>{" "}
                ボタンをタップする
                <div className="mt-1 text-sm text-zinc-400">
                  ※ このボタンは出勤中のみ表示されます
                </div>
              </Step>
              <Step num={3}>指紋または顔認証で確認する</Step>
            </div>
            <Good>「Break started ✓」と表示されれば休憩開始の記録完了です</Good>
            <Note>
              休憩は <span className="font-bold text-amber-300">50分以内</span> にしてください。
              50分を超えると通知が届きます。
            </Note>
          </SectionCard>
        )}

        {/* ブレイクアウト */}
        {activeSection === "breakout" && (
          <SectionCard title="ブレイクアウト（休憩終了）" emoji="🔔" color="border-amber-800">
            <div className="rounded-xl bg-amber-950/40 border border-amber-500/20 px-4 py-3 text-sm text-amber-200">
              休憩が終わったら必ずブレイクアウトをしてください。
            </div>
            <div className="space-y-3">
              <Step num={1}>
                画面下のメニューから{" "}
                <span className="rounded bg-zinc-700 px-2 py-0.5 font-mono text-sm">Attendance</span>{" "}
                をタップする
              </Step>
              <Step num={2}>
                オレンジ色の{" "}
                <span className="rounded bg-amber-700 px-2 py-0.5 font-mono text-sm">⏹ Break Out</span>{" "}
                ボタンをタップする
                <div className="mt-1 text-sm text-zinc-400">
                  ※ 休憩中のみ表示されます
                </div>
              </Step>
              <Step num={3}>指紋または顔認証で確認する</Step>
            </div>
            <Good>「Break ended ✓」と表示されれば休憩終了の記録完了です</Good>
            <Note>
              ブレイクアウトをしないと退勤打刻（タイムアウト）ができません。
              退勤前に必ずブレイクアウトをしてください。
            </Note>
          </SectionCard>
        )}

        {/* タイムアウト */}
        {activeSection === "timeout" && (
          <SectionCard title="タイムアウト（退勤打刻）" emoji="🔴" color="border-red-800">
            <div className="rounded-xl bg-red-950/40 border border-red-500/20 px-4 py-3 text-sm text-red-200">
              退勤するときは必ずタイムアウトをしてください。
            </div>
            <Note>
              休憩中は「Clock Out」ボタンが表示されません。
              先に <span className="font-bold text-amber-300">ブレイクアウト</span> をしてから退勤してください。
            </Note>
            <div className="space-y-3">
              <Step num={1}>
                画面下のメニューから{" "}
                <span className="rounded bg-zinc-700 px-2 py-0.5 font-mono text-sm">Attendance</span>{" "}
                をタップする
              </Step>
              <Step num={2}>
                赤い{" "}
                <span className="rounded bg-red-700 px-2 py-0.5 font-mono text-sm">🔴 Clock Out</span>{" "}
                ボタンをタップする
              </Step>
              <Step num={3}>指紋または顔認証で確認する</Step>
            </div>
            <Good>「Clocked out ✓」と表示されれば退勤打刻完了です</Good>

            <div className="rounded-xl bg-zinc-800/60 px-4 py-3">
              <p className="text-sm font-bold text-zinc-200 mb-2">📋 1日の流れ（まとめ）</p>
              <div className="space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-emerald-700 flex items-center justify-center text-xs">1</span>
                  <span className="text-zinc-300">出勤 → タイムイン（Clock In）</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-sky-700 flex items-center justify-center text-xs">2</span>
                  <span className="text-zinc-300">休憩開始 → ブレイクイン（Break In）</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-amber-700 flex items-center justify-center text-xs">3</span>
                  <span className="text-zinc-300">休憩終了 → ブレイクアウト（Break Out）</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-red-700 flex items-center justify-center text-xs">4</span>
                  <span className="text-zinc-300">退勤 → タイムアウト（Clock Out）</span>
                </div>
              </div>
            </div>
          </SectionCard>
        )}

        {/* 経費申請 */}
        {activeSection === "expense" && (
          <SectionCard title="経費申請（Expense Reimbursement）" emoji="💳" color="border-violet-800">
            <div className="rounded-xl bg-violet-950/40 border border-violet-500/20 px-4 py-3 text-sm text-violet-200">
              仕事で使ったお金を申請できます。申請後、本部で審査されます。
            </div>
            <div className="space-y-3">
              <Step num={1}>
                メニューから{" "}
                <span className="rounded bg-zinc-700 px-2 py-0.5 font-mono text-sm">Expense Reimbursement</span>{" "}
                をタップする
              </Step>
              <Step num={2}>
                <div>
                  カテゴリ（種類）を選ぶ：
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <CategoryBadge label="Ingredients" jp="食材" />
                    <CategoryBadge label="Transport" jp="交通費" />
                    <CategoryBadge label="Uniform" jp="制服" />
                    <CategoryBadge label="Equipment" jp="備品" />
                    <CategoryBadge label="Mobile" jp="携帯" />
                    <CategoryBadge label="Other" jp="その他" />
                  </div>
                </div>
              </Step>
              <Step num={3}>
                金額を入力する
                <div className="mt-1 text-sm text-zinc-400">
                  ドバイのスタッフ → AED（ディルハム）
                  <br />
                  マニラのスタッフ → PHP（ペソ）
                </div>
              </Step>
              <Step num={4}>経費が発生した日付を選ぶ</Step>
              <Step num={5}>説明欄に詳細を書く（任意・書かなくてもOK）</Step>
              <Step num={6}>
                <span className="rounded bg-violet-700 px-2 py-0.5 font-mono text-sm">Submit Request</span>{" "}
                ボタンをタップして申請する
              </Step>
            </div>
            <Good>
              申請が完了すると、受信箱（Inbox）に確認メッセージが届きます。
              審査結果も同じく受信箱でお知らせします。
            </Good>
            <Note>
              1回の申請で申請できるのは1件のみです。
              複数の経費がある場合は、1件ずつ申請してください。
            </Note>
          </SectionCard>
        )}

        {/* 受信箱 */}
        {activeSection === "inbox" && (
          <SectionCard title="受信箱（Inbox）の確認" emoji="📬" color="border-zinc-700">
            <div className="rounded-xl bg-zinc-800/60 px-4 py-3 text-sm text-zinc-300">
              本部からのメッセージや経費申請の審査結果がここに届きます。
            </div>
            <div className="space-y-3">
              <Step num={1}>
                メニューから{" "}
                <span className="rounded bg-zinc-700 px-2 py-0.5 font-mono text-sm">📬 Inbox</span>{" "}
                をタップする
              </Step>
              <Step num={2}>
                <span className="rounded bg-violet-700 px-2 py-0.5 font-mono text-sm">Refresh</span>{" "}
                ボタンをタップして最新のメッセージを読み込む
              </Step>
              <Step num={3}>メッセージをタップして内容を確認する</Step>
              <Step num={4}>
                確認が終わったら{" "}
                <span className="rounded bg-zinc-700 px-2 py-0.5 font-mono text-sm">Mark read</span>{" "}
                をタップして既読にする
              </Step>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-bold text-zinc-200">経費申請の状態について：</p>
              <div className="grid grid-cols-1 gap-2">
                <div className="flex items-center gap-3 rounded-lg bg-amber-950/30 border border-amber-500/20 px-3 py-2">
                  <span className="text-amber-400 font-bold text-sm">Pending</span>
                  <span className="text-zinc-400 text-sm">→ 審査中（しばらくお待ちください）</span>
                </div>
                <div className="flex items-center gap-3 rounded-lg bg-emerald-950/30 border border-emerald-500/20 px-3 py-2">
                  <span className="text-emerald-400 font-bold text-sm">Approved</span>
                  <span className="text-zinc-400 text-sm">→ 承認されました</span>
                </div>
                <div className="flex items-center gap-3 rounded-lg bg-emerald-950/30 border border-emerald-500/20 px-3 py-2">
                  <span className="text-emerald-400 font-bold text-sm">Paid</span>
                  <span className="text-zinc-400 text-sm">→ 支払い済み</span>
                </div>
                <div className="flex items-center gap-3 rounded-lg bg-red-950/30 border border-red-500/20 px-3 py-2">
                  <span className="text-red-400 font-bold text-sm">Rejected</span>
                  <span className="text-zinc-400 text-sm">→ 却下されました（理由を確認してください）</span>
                </div>
              </div>
            </div>
          </SectionCard>
        )}

        {/* 困ったとき */}
        {activeSection === "trouble" && (
          <SectionCard title="困ったとき" emoji="🆘" color="border-zinc-700">
            <div className="space-y-4">
              <div className="rounded-xl bg-zinc-800/60 px-4 py-3 space-y-2">
                <p className="text-sm font-bold text-red-300">❌ 指紋・顔認証ができない場合</p>
                <p className="text-sm text-zinc-300">
                  初回のみデバイス登録が必要です。Attendanceページで{" "}
                  <span className="text-violet-300 font-mono">Register This Device</span> をタップしてください。
                </p>
              </div>

              <div className="rounded-xl bg-zinc-800/60 px-4 py-3 space-y-2">
                <p className="text-sm font-bold text-amber-300">📍 GPS（位置情報）が取得できない場合</p>
                <ol className="text-sm text-zinc-300 space-y-1 list-decimal list-inside">
                  <li>窓の近くや屋外に移動して再試行する</li>
                  <li>スマホの設定 → プライバシー → 位置情報サービスをONにする</li>
                  <li>ブラウザの設定でこのサイトの位置情報を許可する</li>
                </ol>
              </div>

              <div className="rounded-xl bg-zinc-800/60 px-4 py-3 space-y-2">
                <p className="text-sm font-bold text-sky-300">📱 ページが表示されない場合</p>
                <ol className="text-sm text-zinc-300 space-y-1 list-decimal list-inside">
                  <li>ページを更新する（引っ張って更新）</li>
                  <li>ブラウザを閉じてもう一度開く</li>
                  <li>一度ログアウトして、再度ログインする</li>
                </ol>
              </div>

              <div className="rounded-xl bg-zinc-800/60 px-4 py-3 space-y-2">
                <p className="text-sm font-bold text-violet-300">🔑 PINを忘れた場合</p>
                <p className="text-sm text-zinc-300">
                  マネージャーまたはHRに連絡してPINをリセットしてもらってください。
                </p>
              </div>

              <div className="rounded-xl bg-zinc-800/60 px-4 py-3 space-y-2">
                <p className="text-sm font-bold text-emerald-300">⏰ 打刻を忘れた場合</p>
                <p className="text-sm text-zinc-300">
                  マネージャーに報告してください。後から修正してもらえます。
                  自分では修正できませんのでご注意ください。
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-violet-950/40 border border-violet-500/30 px-4 py-3 mt-2">
              <p className="text-sm font-bold text-violet-200 mb-1">このマニュアルのURL</p>
              <p className="text-xs font-mono text-violet-300 break-all">
                https://sushizen-shift-pwa.vercel.app/staff-guide
              </p>
              <p className="text-xs text-zinc-400 mt-1">ブックマークして保存しておいてください</p>
            </div>
          </SectionCard>
        )}
      </div>

      {/* Footer */}
      <div className="text-center py-8 text-xs text-zinc-600">
        Sushi ZEN Workforce OS — Staff Guide v1.0
      </div>
    </div>
  );
}

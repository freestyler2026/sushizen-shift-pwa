// Franchise owner portal. Owners have no staff account, so none of the staff
// chrome (navigation, session guard) appears here -- LayoutShell leaves /owner bare.
export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-slate-950 text-slate-100">{children}</div>;
}

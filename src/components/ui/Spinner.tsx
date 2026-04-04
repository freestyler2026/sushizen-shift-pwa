export function Spinner({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const s = { sm: "h-4 w-4", md: "h-6 w-6", lg: "h-8 w-8" }[size];
  return <div className={`${s} animate-spin rounded-full border-2 border-white/10 border-t-amber-400`} />;
}

type Props = {
  label: string;
  children: React.ReactNode;
  hint?: string;
};

export function Field({ label, children, hint }: Props) {
  return (
    <label className="block">
      <div className="mb-1 text-xs font-medium text-neutral-300">{label}</div>
      {children}
      {hint ? <div className="mt-1 text-xs text-neutral-500">{hint}</div> : null}
    </label>
  );
}
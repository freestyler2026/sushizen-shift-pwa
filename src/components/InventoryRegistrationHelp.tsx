"use client";

export default function InventoryRegistrationHelp() {
  return (
    <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
      <div className="text-sm font-semibold text-neutral-100">Where do I register what?</div>
      <div className="mt-2 grid grid-cols-1 gap-2 text-xs text-neutral-300 md:grid-cols-2">
        <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 px-3 py-2">
          Raw ingredients -&gt; Ingredients / Products (Items)
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 px-3 py-2">
          CK-made products -&gt; Ingredients / Products (Products)
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 px-3 py-2">
          Sales menu ingredient mapping -&gt; Sales Menu BOM
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 px-3 py-2">
          CK production recipe -&gt; CK Production
        </div>
      </div>
    </section>
  );
}

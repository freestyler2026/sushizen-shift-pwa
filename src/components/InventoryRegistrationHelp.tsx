"use client";

export default function InventoryRegistrationHelp() {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-xl shadow-black/20 backdrop-blur-sm">
      <div className="text-lg font-semibold text-white">Where do I register what?</div>
      <div className="mt-2 grid grid-cols-1 gap-2 text-sm leading-relaxed text-zinc-400 md:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/8 to-white/3 px-3 py-2 shadow-lg shadow-black/30 backdrop-blur-sm">
          Raw ingredients -&gt; Ingredients / Products (Items)
        </div>
        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/8 to-white/3 px-3 py-2 shadow-lg shadow-black/30 backdrop-blur-sm">
          CK-made products -&gt; Ingredients / Products (Products)
        </div>
        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/8 to-white/3 px-3 py-2 shadow-lg shadow-black/30 backdrop-blur-sm">
          Sales menu ingredient mapping -&gt; Sales Menu BOM
        </div>
        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/8 to-white/3 px-3 py-2 shadow-lg shadow-black/30 backdrop-blur-sm">
          CK production recipe -&gt; CK Production
        </div>
      </div>
    </section>
  );
}

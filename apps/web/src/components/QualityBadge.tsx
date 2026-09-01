export function QualityBadge({ quality }: { readonly quality: string }) {
  return (
    <div className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-black/80 backdrop-blur-md border border-white/20 text-white font-black text-[8px] uppercase select-none">
      <span className="w-1 h-1 rounded-full bg-white/70" />
      <span>{quality}</span>
    </div>
  );
}

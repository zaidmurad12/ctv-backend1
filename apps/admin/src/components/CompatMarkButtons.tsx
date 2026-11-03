import { useState } from 'react';
import { Check, X } from 'lucide-react';

// Manual compatibility mark shown on each list row: the admin tests a title in the app, then marks
// it here (true = plays from a source, false = tested and does not, null = not tested yet).
// Clicking the already-active value clears it back to "not tested".
export function CompatMarkButtons({
  value,
  onSet,
}: {
  value: boolean | null | undefined;
  onSet: (next: boolean | null) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  async function set(next: boolean) {
    setBusy(true);
    try {
      await onSet(value === next ? null : next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="shrink-0 flex items-center gap-1"
      title="تعليم يدوي بعد اختبار العمل في التطبيق"
    >
      <button
        type="button"
        disabled={busy}
        onClick={() => void set(true)}
        className={`p-1.5 rounded-md border text-[11px] ${
          value === true
            ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
            : 'border-zinc-800 text-zinc-600 hover:text-emerald-400'
        }`}
        title="متوافق"
      >
        <Check size={13} />
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => void set(false)}
        className={`p-1.5 rounded-md border text-[11px] ${
          value === false
            ? 'bg-red-500/20 border-red-500/50 text-red-400'
            : 'border-zinc-800 text-zinc-600 hover:text-red-400'
        }`}
        title="غير متوافق"
      >
        <X size={13} />
      </button>
    </div>
  );
}

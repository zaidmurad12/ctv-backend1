import { useState } from 'react';
import { Check, Loader2, Sparkles } from 'lucide-react';
import { adminService } from '../services/adminService';

// Puts a title at the front of the "recently added in the sources" home row: marks it compatible
// and dates that now (see the backend's admin/sourceCheck.ts markRecent).
export function MarkRecentButton({ type, id }: { type: 'movie' | 'show'; id: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');

  async function mark() {
    setState('busy');
    try {
      await adminService.markRecentlyAdded(type, id);
      setState('done');
    } catch {
      setState('error');
    }
  }

  return (
    <button
      type="button"
      disabled={state === 'busy' || state === 'done'}
      onClick={() => void mark()}
      title="يجعله متوافقاً ويضعه في أول قسم «مضاف حديثاً»"
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-emerald-300 border border-emerald-900 hover:bg-zinc-900 transition-colors disabled:opacity-60"
    >
      {state === 'busy' ? (
        <Loader2 size={12} className="animate-spin" />
      ) : state === 'done' ? (
        <Check size={12} />
      ) : (
        <Sparkles size={12} />
      )}
      {state === 'done'
        ? 'أُضيف إلى المضاف حديثاً'
        : state === 'error'
          ? 'تعذّر، حاول مجدداً'
          : 'إظهار في المضاف حديثاً'}
    </button>
  );
}

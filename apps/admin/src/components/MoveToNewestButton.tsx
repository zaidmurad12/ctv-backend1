import { useState } from 'react';
import { ArrowUpToLine, Check, Loader2 } from 'lucide-react';
import { adminService } from '../services/adminService';

// Moves a title to the front of the "recently added" home row - it moves back as newer titles arrive
// or are moved there (see the backend's admin/sourceCheck.ts promote). Can be pressed again any time.
export function MoveToNewestButton({ type, id }: { type: 'movie' | 'show'; id: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');

  async function move() {
    setState('busy');
    try {
      await adminService.moveToNewest(type, id);
      setState('done');
      setTimeout(() => setState('idle'), 4000);
    } catch {
      setState('error');
    }
  }

  return (
    <button
      type="button"
      disabled={state === 'busy'}
      onClick={() => void move()}
      title="يظهر العمل أول قسم «مضاف حديثاً»، ويتراجع حين تصل أعمال أحدث منه"
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-emerald-300 border border-emerald-900 hover:bg-zinc-900 transition-colors disabled:opacity-60"
    >
      {state === 'busy' ? (
        <Loader2 size={12} className="animate-spin" />
      ) : state === 'done' ? (
        <Check size={12} />
      ) : (
        <ArrowUpToLine size={12} />
      )}
      {state === 'done'
        ? 'نُقل إلى الأحدث'
        : state === 'error'
          ? 'تعذّر، حاول مجدداً'
          : 'نقل إلى الأحدث'}
    </button>
  );
}

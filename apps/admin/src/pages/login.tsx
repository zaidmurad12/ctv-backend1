import type { FormEvent } from 'react';
import { useState } from 'react';
import { useRouter } from 'next/router';
import { Shield } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../lib/apiError';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const forbidden = router.query.forbidden === '1';

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    setIsSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : 'فشل تسجيل الدخول.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-7 p-6 bg-black">
      <div className="inline-flex items-center gap-2.5 text-2xl font-black">
        <span className="inline-flex items-center justify-center w-[38px] h-[38px] rounded-[10px] bg-white text-black">
          <Shield size={20} />
        </span>
        CTV Admin
      </div>
      <form
        className="w-[340px] flex flex-col gap-4 bg-[#0a0a0a] border border-zinc-800 rounded-2xl p-9 shadow-2xl"
        onSubmit={handleSubmit}
      >
        <h1 className="text-xl font-black">تسجيل الدخول</h1>
        <p className="-mt-2 text-sm text-zinc-500">للمسؤولين فقط.</p>
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-zinc-400">
          البريد الإلكتروني
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoFocus
            className="px-3.5 py-2.5 rounded-lg border border-zinc-800 bg-black text-white text-sm focus:outline-none focus:border-white transition-colors"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-zinc-400">
          كلمة المرور
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            className="px-3.5 py-2.5 rounded-lg border border-zinc-800 bg-black text-white text-sm focus:outline-none focus:border-white transition-colors"
          />
        </label>
        {forbidden && !error && (
          <p className="text-sm text-amber-400">
            هذا الحساب لا يملك صلاحية الوصول إلى لوحة التحكم.
          </p>
        )}
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-1 py-3 rounded-lg bg-white text-black font-bold text-sm disabled:opacity-60 disabled:cursor-default hover:bg-zinc-200 transition-colors"
        >
          {isSubmitting ? 'جارٍ الدخول...' : 'دخول'}
        </button>
      </form>
    </div>
  );
}

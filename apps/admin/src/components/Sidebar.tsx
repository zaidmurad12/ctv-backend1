import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  Film,
  GalleryHorizontal,
  LayoutDashboard,
  LogOut,
  Menu,
  Radio,
  ScanSearch,
  Sparkles,
  Tv,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const NAV_ITEMS = [
  { href: '/', label: 'لوحة القيادة', Icon: LayoutDashboard },
  { href: '/movies', label: 'الأعمال', Icon: Film },
  { href: '/shows', label: 'المسلسلات', Icon: Tv },
  { href: '/discover', label: 'استيراد ذكي', Icon: Sparkles },
  { href: '/source-check', label: 'فحص التوافق', Icon: ScanSearch },
  { href: '/banner', label: 'البنر الرئيسي', Icon: GalleryHorizontal },
  { href: '/home-sections', label: 'أقسام الشاشة الرئيسية', Icon: Sparkles },
  { href: '/providers', label: 'مزوّدو المحتوى', Icon: Radio },
  { href: '/users', label: 'المستخدمون', Icon: Users },
] as const;

// `open`/`onClose` only matter below the `md` breakpoint (see AdminLayout) - above it this
// renders as the same permanent column it always was, regardless of their value.
function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { user, logout } = useAuth();

  return (
    <>
      {/* Backdrop - only ever mounted while the drawer is open on a small screen, and never
          rendered at all at `md` and up (the sidebar there isn't a dismissible overlay). */}
      {open && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={`w-60 shrink-0 h-screen flex flex-col border-e border-zinc-800 bg-[#0a0a0a] p-4 z-50 fixed top-0 start-0 transition-transform md:sticky md:translate-x-0 md:rtl:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-2 py-3 mb-4">
          <div>
            <div className="text-lg font-black">CTV Admin</div>
            <div className="text-xs text-zinc-500 mt-0.5">لوحة تحكم المنصة</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="md:hidden p-1.5 rounded-md text-zinc-500 hover:text-white hover:bg-zinc-900 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        <nav className="flex flex-col gap-1 flex-1 overflow-y-auto">
          {NAV_ITEMS.map(({ href, label, Icon }) => {
            const active = href === '/' ? router.pathname === '/' : router.pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                  active ? 'bg-white text-black' : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
                }`}
              >
                <Icon size={17} />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-zinc-800 pt-3 mt-3">
          <div className="px-3 text-xs text-zinc-500 mb-2 truncate">{user?.email}</div>
          <button
            type="button"
            onClick={() => void logout()}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-zinc-400 hover:bg-zinc-900 hover:text-white transition-colors"
          >
            <LogOut size={17} />
            تسجيل الخروج
          </button>
        </div>
      </aside>
    </>
  );
}

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      <Sidebar open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      {/* min-w-0 is the actual fix for "a long pasted link widens the whole page" - flex items
          default to min-width:auto, meaning their minimum size is their content's min-content
          width unless told otherwise. Every input along the way can have its own min-w-0 (and
          does), but without this one too, a single long unbroken string anywhere inside can
          still stretch this whole flex item - and with it the page - past the viewport. */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* The permanent w-60 sidebar used to be the only way into any other page on a phone-width
            screen (it either ate a third of the viewport or, un-collapsed, was never reachable at
            all) - this top bar (hidden once the sidebar has room to sit permanently, at `md`) is
            what the hamburger button opening the same sidebar as a slide-in drawer actually needs
            to exist. */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-zinc-800 bg-[#0a0a0a] sticky top-0 z-30">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="p-1.5 rounded-md text-zinc-300 hover:bg-zinc-900 transition-colors"
          >
            <Menu size={20} />
          </button>
          <div className="text-sm font-black">CTV Admin</div>
        </header>
        <main className="flex-1 min-w-0 p-4 md:p-8 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}

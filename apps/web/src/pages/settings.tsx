import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { LogOut, User } from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { TVButton } from '../components/TVButton';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../context/LocaleContext';
import { usersService } from '../services/usersService';
import { ApiError } from '../lib/apiError';

export default function SettingsPage() {
  const { user, logout, refreshUser } = useAuth();
  const { t } = useLocale();

  const [username, setUsername] = useState(user?.username ?? '');

  useEffect(() => {
    if (user) setUsername(user.username);
  }, [user]);
  const [profileMessage, setProfileMessage] = useState<string | undefined>(undefined);
  const [profileError, setProfileError] = useState<string | undefined>(undefined);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState<string | undefined>(undefined);
  const [passwordError, setPasswordError] = useState<string | undefined>(undefined);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  if (!user) {
    return null;
  }

  async function handleProfileSubmit(event: FormEvent) {
    event.preventDefault();
    setProfileMessage(undefined);
    setProfileError(undefined);
    setIsSavingProfile(true);
    try {
      await usersService.updateProfile({ username });
      await refreshUser();
      setProfileMessage(t('settings.profileUpdated'));
    } catch (err) {
      setProfileError(err instanceof ApiError ? err.message : t('login.error'));
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function handlePasswordSubmit(event: FormEvent) {
    event.preventDefault();
    setPasswordMessage(undefined);
    setPasswordError(undefined);
    setIsSavingPassword(true);
    try {
      await usersService.changePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setPasswordMessage(t('settings.passwordUpdated'));
    } catch (err) {
      setPasswordError(err instanceof ApiError ? err.message : t('login.error'));
    } finally {
      setIsSavingPassword(false);
    }
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className="max-w-2xl mx-auto w-full px-6 md:px-10 py-10 flex flex-col gap-6">
        <h1 className="text-2xl font-black">{t('settings.title')}</h1>

        <section className="bg-[#14161f] border border-zinc-800 rounded-2xl p-6 flex flex-col gap-4">
          <h2 className="flex items-center gap-2 text-sm font-black text-zinc-300">
            <User size={16} /> {t('settings.account')}
          </h2>
          <form onSubmit={handleProfileSubmit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm font-semibold text-zinc-400">
              {t('settings.username')}
              <input
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
                minLength={3}
                className="px-3.5 py-2.5 rounded-lg border border-zinc-800 bg-black text-white text-sm focus:outline-none focus:border-white transition-colors"
              />
            </label>
            {profileError && <p className="text-sm text-red-400">{profileError}</p>}
            {profileMessage && <p className="text-sm text-emerald-400">{profileMessage}</p>}
            <TVButton
              type="submit"
              variant="primary"
              disabled={isSavingProfile}
              className="self-start"
            >
              {isSavingProfile ? t('settings.saving') : t('settings.saveChanges')}
            </TVButton>
          </form>
        </section>

        <section className="bg-[#14161f] border border-zinc-800 rounded-2xl p-6 flex flex-col gap-4">
          <h2 className="text-sm font-black text-zinc-300">{t('settings.changePassword')}</h2>
          <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm font-semibold text-zinc-400">
              {t('settings.currentPassword')}
              <input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
                className="px-3.5 py-2.5 rounded-lg border border-zinc-800 bg-black text-white text-sm focus:outline-none focus:border-white transition-colors"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold text-zinc-400">
              {t('settings.newPassword')}
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                required
                minLength={12}
                className="px-3.5 py-2.5 rounded-lg border border-zinc-800 bg-black text-white text-sm focus:outline-none focus:border-white transition-colors"
              />
            </label>
            {passwordError && <p className="text-sm text-red-400">{passwordError}</p>}
            {passwordMessage && <p className="text-sm text-emerald-400">{passwordMessage}</p>}
            <TVButton
              type="submit"
              variant="secondary"
              disabled={isSavingPassword}
              className="self-start"
            >
              {isSavingPassword ? t('settings.updatingPassword') : t('settings.updatePassword')}
            </TVButton>
          </form>
        </section>

        <TVButton
          variant="ghost"
          icon={<LogOut size={16} />}
          onClick={() => void logout()}
          className="self-start"
        >
          {t('settings.signOut')}
        </TVButton>
      </main>
    </div>
  );
}

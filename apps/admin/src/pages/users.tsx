import { useEffect, useState } from 'react';
import { AdminLayout } from '../components/Sidebar';
import { useAuth } from '../context/AuthContext';
import { adminService } from '../services/adminService';
import type { UserResponseDto, UserRole } from '../lib/types';

const ROLES: UserRole[] = ['ADMIN', 'EDITOR', 'VIEWER'];

export default function UsersPage() {
  const { isLoading, user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserResponseDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    adminService
      .listUsers()
      .then((result) => setUsers(result.items))
      .catch((err) => setError(err instanceof Error ? err.message : 'تعذّر تحميل المستخدمين.'));
  }

  useEffect(() => {
    if (currentUser) load();
  }, [currentUser]);

  async function changeRole(u: UserResponseDto, role: UserRole) {
    setBusyId(u.id);
    try {
      await adminService.updateUser(u.id, { role });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل تحديث الصلاحية.');
    } finally {
      setBusyId(null);
    }
  }

  async function toggleActive(u: UserResponseDto) {
    setBusyId(u.id);
    try {
      await adminService.updateUser(u.id, { isActive: !u.isActive });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل تحديث الحالة.');
    } finally {
      setBusyId(null);
    }
  }

  if (isLoading || !currentUser) return null;

  return (
    <AdminLayout>
      <h1 className="text-2xl font-black mb-1">المستخدمون</h1>
      <p className="text-sm text-zinc-500 mb-8">إدارة صلاحيات وحالة الحسابات.</p>

      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

      <div className="bg-[#0a0a0a] border border-zinc-800 rounded-2xl overflow-hidden">
        {users.map((u, i) => (
          <div
            key={u.id}
            className={`flex items-center gap-4 px-6 py-4 ${i > 0 ? 'border-t border-zinc-800' : ''}`}
          >
            <div className="flex-1">
              <div className="font-bold">{u.username}</div>
              <div className="text-xs text-zinc-500 mt-0.5">{u.email}</div>
            </div>
            <select
              value={u.role}
              disabled={busyId === u.id || u.id === currentUser.id}
              onChange={(event) => void changeRole(u, event.target.value as UserRole)}
              className="px-3 py-2 rounded-lg text-xs font-semibold bg-black border border-zinc-800 text-white disabled:opacity-50"
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={busyId === u.id || u.id === currentUser.id}
              onClick={() => void toggleActive(u)}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 ${
                u.isActive
                  ? 'bg-white text-black hover:bg-zinc-200'
                  : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'
              }`}
            >
              {u.isActive ? 'نشط' : 'موقوف'}
            </button>
          </div>
        ))}
      </div>
    </AdminLayout>
  );
}

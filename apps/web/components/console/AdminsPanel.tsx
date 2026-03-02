'use client';

import { useCallback, useEffect, useState } from 'react';
import { authDel, authGet, authPost } from '@/lib/api-auth';

interface AdminEntry {
  id?: string;
  email: string;
  source: 'env' | 'database';
  removable: boolean;
  createdAt?: string;
}

const AdminsPanel = () => {
  const [admins, setAdmins] = useState<AdminEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [adding, setAdding] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const fetchAdmins = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await authGet<{ admins: AdminEntry[] }>('/admin-emails');
      setAdmins(data.admins);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load admins');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAdmins();
  }, [fetchAdmins]);

  useEffect(() => {
    if (!confirmDeleteId) return;
    const timer = setTimeout(() => setConfirmDeleteId(null), 3000);
    return () => clearTimeout(timer);
  }, [confirmDeleteId]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) return;
    setAdding(true);
    setError('');

    try {
      await authPost('/admin-emails', { email: newEmail.trim() });
      setNewEmail('');
      fetchAdmins();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add admin');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    try {
      await authDel(`/admin-emails/${id}`);
      setConfirmDeleteId(null);
      fetchAdmins();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove admin');
    }
  };

  if (loading) {
    return <p className="text-sm text-primary-light py-8 text-center">Loading...</p>;
  }

  return (
    <div>
      <form onSubmit={handleAdd} className="flex gap-3 mb-6">
        <input
          type="email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          placeholder="admin@example.org"
          required
          className="flex-1 max-w-sm px-3 py-1.5 border border-gray-600 rounded-md text-sm bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
        />
        <button
          type="submit"
          disabled={adding}
          className="px-3 py-1.5 text-sm text-white bg-primary rounded-md hover:bg-primary-mid disabled:opacity-50 transition-colors"
        >
          {adding ? 'Adding...' : 'Add Admin'}
        </button>
      </form>

      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

      {admins.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">No admin emails configured.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700 text-left text-primary-light">
              <th className="pb-2 font-medium">Email</th>
              <th className="pb-2 font-medium">Source</th>
              <th className="pb-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {admins.map((admin, i) => (
              <tr
                key={admin.id ?? `env-${i}`}
                className="border-b border-gray-700 hover:bg-gray-800"
              >
                <td className="py-2.5 text-gray-300">{admin.email}</td>
                <td className="py-2.5">
                  <span
                    className={`px-1.5 py-0.5 text-xs rounded font-medium ${
                      admin.source === 'env'
                        ? 'bg-amber-900 text-amber-100'
                        : 'bg-blue-900 text-blue-100'
                    }`}
                  >
                    {admin.source === 'env' ? 'env var' : 'database'}
                  </span>
                </td>
                <td className="py-2.5 text-right">
                  {admin.removable &&
                    admin.id &&
                    (() => {
                      const id = admin.id;
                      return (
                        <button
                          type="button"
                          onClick={() => handleDelete(id)}
                          className={`text-sm ${
                            confirmDeleteId === admin.id
                              ? 'text-red-400 font-medium'
                              : 'text-red-500 hover:underline'
                          }`}
                        >
                          {confirmDeleteId === admin.id ? 'Confirm?' : 'Remove'}
                        </button>
                      );
                    })()}
                  {!admin.removable && admin.id && (
                    <span className="text-xs text-primary-light">locked</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default AdminsPanel;

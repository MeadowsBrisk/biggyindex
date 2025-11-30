import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import type { OverrideEntry } from '@/lib/taxonomy/categoryOverrides';
import { checkAuth, fetchOverrides, logout } from '@/lib/category-dash/adminApi';
import OverridesTable from '../../components/category-dash/OverridesTable';
import OverrideFormModal from '../../components/category-dash/OverrideFormModal';

export default function AdminOverrides() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [overrides, setOverrides] = useState<OverrideEntry[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [showModal, setShowModal] = useState(false);
  const [editingOverride, setEditingOverride] = useState<OverrideEntry | null>(null);
  const [error, setError] = useState('');

  // Check authentication on mount
  useEffect(() => {
    checkAuthAndLoad();
  }, []);

  const checkAuthAndLoad = async () => {
    try {
      const isAuthed = await checkAuth();
      if (!isAuthed) {
        router.push('/category-dash/login');
        return;
      }
      await loadOverrides();
    } catch {
      router.push('/category-dash/login');
    }
  };

  const loadOverrides = async () => {
    try {
      setLoading(true);
      const data = await fetchOverrides();
      setOverrides(data.overrides || []);
      setLastUpdated(data.updatedAt);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to load overrides');
      if (err.message === 'Not authenticated') {
        router.push('/category-dash/login');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push('/category-dash/login');
  };

  const handleAddNew = () => {
    setEditingOverride(null);
    setShowModal(true);
  };

  const handleEdit = (override: OverrideEntry) => {
    setEditingOverride(override);
    setShowModal(true);
  };

  const handleSaveComplete = () => {
    setShowModal(false);
    setEditingOverride(null);
    loadOverrides(); // Reload data
  };

  const handleDeleteComplete = () => {
    loadOverrides(); // Reload data
  };

  return (
    <>
      <Head>
        <title>Category Dashboard</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        {/* Header */}
        <header className="bg-white dark:bg-gray-800 shadow">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Category Overrides
              </h1>
              {lastUpdated && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Last updated: {new Date(lastUpdated).toLocaleString()}
                </p>
              )}
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
            >
              Logout
            </button>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {error && (
            <div className="mb-4 rounded-md bg-red-50 dark:bg-red-900/20 p-4">
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}

          {/* Actions Bar */}
          <div className="mb-6 flex justify-between items-center">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {overrides.length} override{overrides.length !== 1 ? 's' : ''}
            </p>
            <button
              onClick={handleAddNew}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Override
            </button>
          </div>

          {/* Overrides Table */}
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Loading...</p>
            </div>
          ) : (
            <OverridesTable
              overrides={overrides}
              onEdit={handleEdit}
              onDelete={handleDeleteComplete}
            />
          )}
        </main>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <OverrideFormModal
          override={editingOverride}
          onClose={() => setShowModal(false)}
          onSave={handleSaveComplete}
        />
      )}
    </>
  );
}

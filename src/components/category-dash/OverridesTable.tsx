import { useState } from 'react';
import type { OverrideEntry } from '@/lib/taxonomy/categoryOverrides';
import { deleteOverride } from '@/lib/category-dash/adminApi';

type Props = {
  overrides: OverrideEntry[];
  onEdit: (override: OverrideEntry) => void;
  onDelete: () => void;
};

export default function OverridesTable({ overrides, onEdit, onDelete }: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<'addedAt' | 'itemName' | 'primary'>('addedAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Filter overrides by search query
  const filteredOverrides = overrides.filter((o) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      o.itemName.toLowerCase().includes(q) ||
      o.id.toLowerCase().includes(q) ||
      o.primary.toLowerCase().includes(q) ||
      (o.reason && o.reason.toLowerCase().includes(q))
    );
  });

  // Sort overrides
  const sortedOverrides = [...filteredOverrides].sort((a, b) => {
    let aVal: string | number = '';
    let bVal: string | number = '';

    if (sortKey === 'addedAt') {
      aVal = new Date(a.addedAt).getTime();
      bVal = new Date(b.addedAt).getTime();
    } else {
      aVal = a[sortKey] || '';
      bVal = b[sortKey] || '';
    }

    if (sortDir === 'asc') {
      return aVal > bVal ? 1 : -1;
    }
    return aVal < bVal ? 1 : -1;
  });

  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const handleDelete = async (id: string, itemName: string, exists: boolean = true) => {
    // Skip confirmation for non-existent items
    if (exists && !confirm(`Delete override for "${itemName}"?`)) {
      return;
    }

    try {
      setDeletingId(id);
      await deleteOverride(id);
      onDelete();
    } catch (err: any) {
      alert(`Failed to delete: ${err.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg">
      {/* Search */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <input
          type="text"
          placeholder="Search by item name, ID, category, or reason..."
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-white"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                onClick={() => handleSort('itemName')}
              >
                Item {sortKey === 'itemName' && (sortDir === 'asc' ? '↑' : '↓')}
              </th>
              <th
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                onClick={() => handleSort('primary')}
              >
                Category {sortKey === 'primary' && (sortDir === 'asc' ? '↑' : '↓')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Subcategories
              </th>
              <th
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                onClick={() => handleSort('addedAt')}
              >
                Added {sortKey === 'addedAt' && (sortDir === 'asc' ? '↑' : '↓')}
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {sortedOverrides.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
                  {searchQuery ? 'No overrides match your search.' : 'No overrides yet. Add one to get started.'}
                </td>
              </tr>
            ) : (
              sortedOverrides.map((override) => {
                const itemExists = override.exists !== false;
                const rowOpacity = itemExists ? 'opacity-100' : 'opacity-50';
                
                return (
                  <tr key={override.id} className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 ${rowOpacity}`}>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {override.itemName}
                        {!itemExists && (
                          <span className="ml-2 px-2 py-0.5 text-xs font-medium rounded bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                            Unlisted on LB
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        ID: {override.id}
                        {override.sellerName && ` • Seller: ${override.sellerName}`}
                      </div>
                      {override.reason && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 italic">
                          {override.reason}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200">
                        {override.primary}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900 dark:text-gray-300">
                        {override.subcategories.length > 0
                          ? override.subcategories.join(', ')
                          : '—'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {new Date(override.addedAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => onEdit(override)}
                        className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300 mr-4"
                        disabled={!itemExists}
                      >
                        Edit
                    </button>
                      <button
                        onClick={() => handleDelete(override.id, override.itemName, itemExists)}
                        disabled={deletingId === override.id}
                        className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50"
                      >
                        {deletingId === override.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

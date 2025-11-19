import { useState, useEffect } from 'react';
import type { OverrideEntry } from '../../lib/categoryOverrides';
import { getValidCategories, getValidSubcategories } from '../../lib/categoryOverrides';
import { searchItems, saveOverride, type SearchResult } from '../../lib/category-dash/adminApi';

type Props = {
  override: OverrideEntry | null;
  onClose: () => void;
  onSave: () => void;
};

export default function OverrideFormModal({ override, onClose, onSave }: Props) {
  const [step, setStep] = useState<'search' | 'form'>(override ? 'form' : 'search');
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedItem, setSelectedItem] = useState<SearchResult | null>(null);

  // Form state
  const [itemId, setItemId] = useState(override?.id || '');
  const [itemName, setItemName] = useState(override?.itemName || '');
  const [primary, setPrimary] = useState(override?.primary || '');
  const [subcategories, setSubcategories] = useState<string[]>(override?.subcategories || []);
  const [reason, setReason] = useState(override?.reason || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const categories = getValidCategories();
  const availableSubcats = primary ? getValidSubcategories(primary) : [];

  // Search items (debounced)
  useEffect(() => {
    if (step !== 'search' || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setSearching(true);
        const results = await searchItems(searchQuery);
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, step]);

  const handleSelectItem = (item: SearchResult) => {
    setSelectedItem(item);
    setItemId(item.id);
    setItemName(item.name);
    // Pre-fill with current category if not already overridden
    if (!override) {
      setPrimary(item.category || '');
      setSubcategories(item.subcategories || []);
    }
    setStep('form');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!itemId || !itemName || !primary) {
      setError('Please fill in all required fields');
      return;
    }

    try {
      setSaving(true);
      await saveOverride({
        id: itemId,
        itemName,
        primary,
        subcategories,
        reason: reason || undefined,
      });
      onSave();
    } catch (err: any) {
      setError(err.message || 'Failed to save override');
      setSaving(false);
    }
  };

  const toggleSubcategory = (subcat: string) => {
    setSubcategories((prev) =>
      prev.includes(subcat) ? prev.filter((s) => s !== subcat) : [...prev, subcat]
    );
  };

  return (
    <div className="fixed z-50 inset-0 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        {/* Overlay */}
        <div
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity z-40"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="relative z-50 inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full sm:p-6">
          <div className="absolute top-0 right-0 pt-4 pr-4">
            <button
              type="button"
              onClick={onClose}
              className="bg-white dark:bg-gray-800 rounded-md text-gray-400 hover:text-gray-500 focus:outline-none"
            >
              <span className="sr-only">Close</span>
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="sm:flex sm:items-start">
            <div className="w-full mt-3 text-center sm:mt-0 sm:text-left">
              <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white mb-4">
                {override ? 'Edit Override' : 'Add Category Override'}
              </h3>

              {step === 'search' && !override && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Search for item to override
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-white"
                      placeholder="Enter item name or ID..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      autoFocus
                    />
                  </div>

                  {/* Search Results */}
                  {searching && (
                    <div className="text-center py-4">
                      <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
                    </div>
                  )}

                  {!searching && searchResults.length > 0 && (
                    <div className="border border-gray-200 dark:border-gray-700 rounded-md max-h-96 overflow-y-auto">
                      {searchResults.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => handleSelectItem(item)}
                          className="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-200 dark:border-gray-700 last:border-b-0"
                        >
                          <div className="flex items-start space-x-3">
                            {item.imageUrl && (
                              <img
                                src={item.imageUrl}
                                alt=""
                                className="w-12 h-12 rounded object-cover flex-shrink-0"
                              />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                {item.name}
                              </div>
                              {item.description && (
                                <div className="text-xs text-gray-600 dark:text-gray-300 mt-1 line-clamp-2">
                                  {item.description}
                                </div>
                              )}
                              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                ID: {item.id} • Current: {item.category}
                                {item.subcategories.length > 0 && ` > ${item.subcategories.join(', ')}`}
                              </div>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {!searching && searchQuery.length >= 2 && searchResults.length === 0 && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                      No items found matching "{searchQuery}"
                    </p>
                  )}
                </div>
              )}

              {step === 'form' && (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Selected Item Info */}
                  {selectedItem && (
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-md p-3">
                      <div className="flex items-start space-x-3">
                        {selectedItem.imageUrl && (
                          <img
                            src={selectedItem.imageUrl}
                            alt=""
                            className="w-16 h-16 rounded object-cover flex-shrink-0"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">
                            {selectedItem.name}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Current category: {selectedItem.category}
                            {selectedItem.subcategories.length > 0 && ` > ${selectedItem.subcategories.join(', ')}`}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Primary Category */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Override Category *
                    </label>
                    <select
                      required
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-white"
                      value={primary}
                      onChange={(e) => {
                        setPrimary(e.target.value);
                        setSubcategories([]); // Reset subcategories when primary changes
                      }}
                    >
                      <option value="">Select category...</option>
                      {categories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Subcategories */}
                  {availableSubcats.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Subcategories (optional)
                      </label>
                      <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-md p-3">
                        {availableSubcats.map((subcat) => (
                          <label key={subcat} className="flex items-center space-x-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={subcategories.includes(subcat)}
                              onChange={() => toggleSubcategory(subcat)}
                              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-sm text-gray-700 dark:text-gray-300">{subcat}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Reason */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Reason (optional)
                    </label>
                    <textarea
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-white"
                      rows={3}
                      placeholder="Why is this override needed? e.g., 'Minimal keywords, seller confirmed category'"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      maxLength={500}
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {reason.length}/500 characters
                    </p>
                  </div>

                  {error && (
                    <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-3">
                      <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                    </div>
                  )}

                  {/* Buttons */}
                  <div className="flex space-x-3 pt-4">
                    {!override && step === 'form' && (
                      <button
                        type="button"
                        onClick={() => {
                          setStep('search');
                          setSelectedItem(null);
                          setPrimary('');
                          setSubcategories([]);
                          setReason('');
                        }}
                        className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600"
                      >
                        Back to Search
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={onClose}
                      className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={saving || !primary}
                      className="flex-1 px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {saving ? 'Saving...' : 'Save Override'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

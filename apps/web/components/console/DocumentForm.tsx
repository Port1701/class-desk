'use client';

import { useState } from 'react';

interface DocumentData {
  id?: string;
  title: string;
  content: string;
  category: string | null;
  tags: string[];
}

interface DocumentFormProps {
  document?: DocumentData;
  onSubmit: (data: {
    title: string;
    content: string;
    category?: string;
    tags: string[];
  }) => Promise<void>;
  onCancel: () => void;
}

const DocumentForm = ({ document, onSubmit, onCancel }: DocumentFormProps) => {
  const [title, setTitle] = useState(document?.title ?? '');
  const [content, setContent] = useState(document?.content ?? '');
  const [category, setCategory] = useState(document?.category ?? '');
  const [tags, setTags] = useState(document?.tags?.join(', ') ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const parsedTags = tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      await onSubmit({
        title,
        content,
        category: category || undefined,
        tags: parsedTags,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save document');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-lg font-semibold text-primary-light mb-4">
            {document ? 'Edit Document' : 'Create Document'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="doc-title"
                className="block text-sm font-medium text-primary-light mb-1"
              >
                Title
              </label>
              <input
                id="doc-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-600 rounded-md text-sm bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>

            <div>
              <label
                htmlFor="doc-content"
                className="block text-sm font-medium text-primary-light mb-1"
              >
                Content
              </label>
              <textarea
                id="doc-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                required
                rows={12}
                className="w-full px-3 py-2 border border-gray-600 rounded-md text-sm font-mono bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-y"
              />
            </div>

            <div>
              <label
                htmlFor="doc-category"
                className="block text-sm font-medium text-primary-light mb-1"
              >
                Category
              </label>
              <input
                id="doc-category"
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-600 rounded-md text-sm bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="Optional"
              />
            </div>

            <div>
              <label
                htmlFor="doc-tags"
                className="block text-sm font-medium text-primary-light mb-1"
              >
                Tags
              </label>
              <input
                id="doc-tags"
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                className="w-full px-3 py-2 border border-gray-600 rounded-md text-sm bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="Comma-separated, e.g. reunion, events, housing"
              />
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 text-sm text-gray-300 border border-gray-600 rounded-md hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 text-sm text-white bg-primary rounded-md hover:bg-primary-mid disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Saving...' : document ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default DocumentForm;

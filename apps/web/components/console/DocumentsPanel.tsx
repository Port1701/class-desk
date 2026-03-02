'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/lib/api';
import { authDel, authGet, authPost, authPut } from '@/lib/api-auth';
import DocumentForm from './DocumentForm';

interface Document {
  id: string;
  title: string;
  content: string;
  category: string | null;
  tags: string[];
  hasEmbedding: boolean;
  createdAt: string;
  updatedAt: string;
}

interface DocumentListResponse {
  documents: Document[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const DocumentsPanel = () => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingDoc, setEditingDoc] = useState<Document | undefined>();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [embedAllStatus, setEmbedAllStatus] = useState('');

  const fetchDocuments = useCallback(async (page = 1) => {
    setLoading(true);
    setError('');
    try {
      const data = await authGet<DocumentListResponse>(`/documents?page=${page}&limit=20`);
      setDocuments(data.documents);
      setPagination(data.pagination);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setError('Access denied. Admin privileges required.');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load documents');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // Auto-reset confirm delete after 3s
  useEffect(() => {
    if (!confirmDeleteId) return;
    const timer = setTimeout(() => setConfirmDeleteId(null), 3000);
    return () => clearTimeout(timer);
  }, [confirmDeleteId]);

  const handleCreate = async (data: {
    title: string;
    content: string;
    category?: string;
    tags: string[];
  }) => {
    await authPost('/documents', data);
    setShowForm(false);
    fetchDocuments(pagination.page);
  };

  const handleUpdate = async (data: {
    title: string;
    content: string;
    category?: string;
    tags: string[];
  }) => {
    if (!editingDoc) return;
    await authPut(`/documents/${editingDoc.id}`, data);
    setEditingDoc(undefined);
    setShowForm(false);
    fetchDocuments(pagination.page);
  };

  const handleDelete = async (id: string) => {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    try {
      await authDel(`/documents/${id}`);
      setConfirmDeleteId(null);
      fetchDocuments(pagination.page);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const handleEmbedAll = async () => {
    setEmbedAllStatus('Re-embedding all documents...');
    try {
      const result = await authPost<{
        total: number;
        embedded: number;
        failed: number;
      }>('/documents/embed-all');
      setEmbedAllStatus(
        `Done: ${result.embedded}/${result.total} embedded, ${result.failed} failed`,
      );
      fetchDocuments(pagination.page);
    } catch (err) {
      setEmbedAllStatus(err instanceof Error ? err.message : 'Re-embed failed');
    }
  };

  if (error === 'Access denied. Admin privileges required.') {
    return (
      <div className="text-center py-12 text-primary-light">
        <p className="text-lg font-medium">Access Denied</p>
        <p className="text-sm mt-1">Admin privileges are required to manage documents.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setEditingDoc(undefined);
              setShowForm(true);
            }}
            className="px-3 py-1.5 text-sm text-white bg-primary rounded-md hover:bg-primary-mid transition-colors"
          >
            Create Document
          </button>
          <button
            type="button"
            onClick={handleEmbedAll}
            disabled={embedAllStatus.startsWith('Re-embedding')}
            className="px-3 py-1.5 text-sm text-gray-300 border border-gray-600 rounded-md hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            Re-embed All
          </button>
        </div>
        {embedAllStatus && <span className="text-sm text-primary-light">{embedAllStatus}</span>}
      </div>

      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

      {loading ? (
        <p className="text-sm text-primary-light py-8 text-center">Loading...</p>
      ) : documents.length === 0 ? (
        <p className="text-sm text-primary-light py-8 text-center">
          No documents yet. Create one to get started.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700 text-left text-primary-light">
                  <th className="pb-2 font-medium">Title</th>
                  <th className="pb-2 font-medium">Category</th>
                  <th className="pb-2 font-medium">Tags</th>
                  <th className="pb-2 font-medium text-center">Embedded</th>
                  <th className="pb-2 font-medium">Created</th>
                  <th className="pb-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id} className="border-b border-gray-700 hover:bg-gray-800">
                    <td className="py-2.5 pr-4 font-medium text-gray-100 max-w-[200px] truncate">
                      {doc.title}
                    </td>
                    <td className="py-2.5 pr-4 text-primary-light">{doc.category || '—'}</td>
                    <td className="py-2.5 pr-4">
                      <div className="flex flex-wrap gap-1">
                        {doc.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-1.5 py-0.5 text-xs bg-gray-700 text-gray-300 rounded"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-2.5 text-center">
                      <span
                        className={`inline-block w-2.5 h-2.5 rounded-full ${
                          doc.hasEmbedding ? 'bg-green-500' : 'bg-gray-500'
                        }`}
                        title={doc.hasEmbedding ? 'Has embedding' : 'No embedding'}
                      />
                    </td>
                    <td className="py-2.5 pr-4 text-primary-light whitespace-nowrap">
                      {new Date(doc.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-2.5 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingDoc(doc);
                          setShowForm(true);
                        }}
                        className="text-primary-light hover:underline mr-3"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(doc.id)}
                        className={`${
                          confirmDeleteId === doc.id
                            ? 'text-red-400 font-medium'
                            : 'text-red-500 hover:underline'
                        }`}
                      >
                        {confirmDeleteId === doc.id ? 'Confirm?' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm text-primary-light">
              <span>
                Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => fetchDocuments(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                  className="px-3 py-1 border border-gray-600 rounded-md hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() => fetchDocuments(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages}
                  className="px-3 py-1 border border-gray-600 rounded-md hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {showForm && (
        <DocumentForm
          document={editingDoc}
          onSubmit={editingDoc ? handleUpdate : handleCreate}
          onCancel={() => {
            setShowForm(false);
            setEditingDoc(undefined);
          }}
        />
      )}
    </div>
  );
};

export default DocumentsPanel;

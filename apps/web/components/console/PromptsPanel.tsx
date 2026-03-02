'use client';

import { useCallback, useEffect, useState } from 'react';
import { authGet, authPut } from '@/lib/api-auth';

interface PromptMeta {
  name: string;
  versions: number[];
  labels: string[];
  tags: string[];
  lastUpdatedAt: string;
}

interface TextPrompt {
  type: 'text';
  name: string;
  version: number;
  prompt: string;
  config: unknown;
  labels: string[];
}

interface ChatMessage {
  role: string;
  content: string;
}

interface ChatPrompt {
  type: 'chat';
  name: string;
  version: number;
  prompt: ChatMessage[];
  config: unknown;
  labels: string[];
}

type Prompt = TextPrompt | ChatPrompt;

const PromptsPanel = () => {
  const [prompts, setPrompts] = useState<PromptMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null);
  const [editedContent, setEditedContent] = useState('');
  const [editedMessages, setEditedMessages] = useState<ChatMessage[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  const fetchPrompts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await authGet<{ data: PromptMeta[] }>('/prompts');
      setPrompts(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load prompts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrompts();
  }, [fetchPrompts]);

  const selectPrompt = async (name: string) => {
    setError('');
    setSaveMessage('');
    try {
      const prompt = await authGet<Prompt>(`/prompts/${encodeURIComponent(name)}?label=latest`);
      setSelectedPrompt(prompt);
      if (prompt.type === 'chat') {
        setEditedMessages([...prompt.prompt]);
      } else {
        setEditedContent(prompt.prompt);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load prompt');
    }
  };

  const handleSave = async () => {
    if (!selectedPrompt) return;
    setSaving(true);
    setSaveMessage('');
    setError('');

    try {
      const body =
        selectedPrompt.type === 'chat'
          ? { prompt: editedMessages, type: 'chat', labels: ['latest'] }
          : { prompt: editedContent, type: 'text', labels: ['latest'] };

      const updated = await authPut<Prompt>(
        `/prompts/${encodeURIComponent(selectedPrompt.name)}`,
        body,
      );
      setSelectedPrompt(updated);
      setSaveMessage(`Saved as version ${updated.version}`);
      fetchPrompts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save prompt');
    } finally {
      setSaving(false);
    }
  };

  const updateMessage = (index: number, field: 'role' | 'content', value: string) => {
    setEditedMessages((prev) =>
      prev.map((msg, i) => (i === index ? { ...msg, [field]: value } : msg)),
    );
  };

  if (loading) {
    return (
      <p className="text-sm text-primary dark:text-primary-light py-8 text-center">
        Loading...
      </p>
    );
  }

  return (
    <div className="flex gap-6 min-h-[400px]">
      {/* Prompt list */}
      <div className="w-64 flex-shrink-0">
        <h3 className="text-sm font-medium text-primary dark:text-primary-light mb-2">
          Prompts
        </h3>
        {error && !selectedPrompt && (
          <p className="text-sm text-red-600 dark:text-red-400 mb-2">{error}</p>
        )}
        {prompts.length === 0 ? (
          <p className="text-sm text-gray-600 dark:text-gray-300">No prompts found</p>
        ) : (
          <ul className="space-y-1">
            {prompts.map((p) => (
              <li key={p.name}>
                <button
                  type="button"
                  onClick={() => selectPrompt(p.name)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                    selectedPrompt?.name === p.name
                      ? 'bg-primary text-white dark:bg-primary dark:text-white'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <div className="font-medium truncate">{p.name}</div>
                  <div
                    className={`text-xs ${
                      selectedPrompt?.name === p.name
                        ? 'text-white dark:text-gray-300'
                        : 'text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    {p.versions.length} version{p.versions.length !== 1 && 's'}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Prompt editor */}
      <div className="flex-1 min-w-0">
        {selectedPrompt ? (
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {selectedPrompt.name}
                </h3>
                <p className="text-xs text-gray-600 dark:text-gray-300">
                  Version {selectedPrompt.version} &middot; Type: {selectedPrompt.type} &middot;
                  Labels: {selectedPrompt.labels.join(', ') || 'none'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {saveMessage && (
                  <span className="text-sm text-green-600 dark:text-green-400">{saveMessage}</span>
                )}
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="px-3 py-1.5 text-sm text-white bg-primary rounded-md hover:bg-primary-mid disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>

            {error && selectedPrompt && (
              <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>
            )}

            {selectedPrompt.type === 'chat' ? (
              <div className="space-y-3">
                {editedMessages.map((msg, i) => (
                  <div
                    key={`${msg.role}-${i}`}
                    className="border border-gray-300 dark:border-gray-600 rounded-md p-3 bg-white dark:bg-gray-800"
                  >
                    <label
                      htmlFor={`msg-role-${i}`}
                      className="block text-xs font-medium text-primary dark:text-primary-light mb-1"
                    >
                      Role
                    </label>
                    <input
                      id={`msg-role-${i}`}
                      value={msg.role}
                      onChange={(e) => updateMessage(i, 'role', e.target.value)}
                      className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white mb-2 focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <label
                      htmlFor={`msg-content-${i}`}
                      className="block text-xs font-medium text-primary dark:text-primary-light mb-1"
                    >
                      Content
                    </label>
                    <textarea
                      id={`msg-content-${i}`}
                      value={msg.content}
                      onChange={(e) => updateMessage(i, 'content', e.target.value)}
                      rows={4}
                      className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm font-mono bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary resize-y"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <textarea
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                rows={20}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-mono bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-y"
              />
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-600 dark:text-gray-300 text-sm">
            Select a prompt to edit
          </div>
        )}
      </div>
    </div>
  );
};

export default PromptsPanel;

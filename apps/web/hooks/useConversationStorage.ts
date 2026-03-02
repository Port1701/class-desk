/**
 * Custom hook for managing conversation storage with localStorage
 */

import { useEffect } from 'react';
import type { SourceEntry } from '@/lib/textProcessing';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: SourceEntry[];
}

const STORAGE_KEY = 'classdesk-conversation';
const SESSION_KEY = 'classdesk-session-id';

/**
 * Load conversation from localStorage on mount
 * @param onLoad Callback when loaded data is available
 */
export const useLoadConversation = (onLoad: (messages: Message[]) => void) => {
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Message[];
        onLoad(parsed);
      }
    } catch (error) {
      console.warn('[chat] Failed to load conversation from localStorage:', error);
    }
  }, [onLoad]);
};

/**
 * Save conversation to localStorage whenever it changes
 * @param messages Messages to save
 */
export const useSaveConversation = (messages: Message[]) => {
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch (error) {
      console.warn('[chat] Failed to save conversation to localStorage:', error);
    }
  }, [messages]);
};

/**
 * Get the current session ID from localStorage, or create a new one
 */
export const getOrCreateSessionId = (): string => {
  try {
    const existing = localStorage.getItem(SESSION_KEY);
    if (existing) return existing;

    const newId = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, newId);
    return newId;
  } catch {
    // localStorage unavailable (e.g. private browsing) — return ephemeral ID
    return crypto.randomUUID();
  }
};

/**
 * Clear session ID from localStorage
 */
const clearSessionId = (): void => {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
};

/**
 * Clear conversation from localStorage
 */
export const clearConversationStorage = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('[chat] Failed to clear conversation from localStorage:', error);
  }
  clearSessionId();
};

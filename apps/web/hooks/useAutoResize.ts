/**
 * Custom hook for textarea auto-resize functionality
 */

import { useCallback, useRef } from 'react';

/**
 * Hook to manage textarea auto-resize based on content
 * Automatically adjusts height to fit content up to max-height
 * @returns Object containing ref for textarea and autoResize callback
 */
export const useAutoResize = () => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const autoResize = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }, []);

  return { textareaRef, autoResize };
};

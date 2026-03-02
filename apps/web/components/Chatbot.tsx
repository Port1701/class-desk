'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { markdownComponents } from '@/components/chat/markdownComponents';
import ScrollToBottomButton from '@/components/chat/ScrollToBottomButton';
import SendButton from '@/components/chat/SendButton';
import SuggestionPill from '@/components/chat/SuggestionPill';
import ToolStatusIndicator from '@/components/chat/ToolStatusIndicator';
import { useAutoResize } from '@/hooks/useAutoResize';
import {
  clearConversationStorage,
  getOrCreateSessionId,
  type Message,
  useLoadConversation,
  useSaveConversation,
} from '@/hooks/useConversationStorage';
import { fixSpacing } from '@/lib/formatting';
import { remarkCitations } from '@/lib/remarkCitations';
import {
  cleanDisplayContent,
  convertSeparatorsToBlankLines,
  extractMainContent,
  extractSources,
  extractSuggestions,
  getToolStatusFromBuffer,
  stripToolMarkers,
  type ToolStatus,
} from '@/lib/textProcessing';
const SUGGESTIONS = [
  'When is the 5th Reunion?',
  'How do I register?',
  'What events are planned?',
  'What should I know?',
];

const SUGGESTIONS_DELIMITER = '\n\n---SUGGESTIONS---\n';

const Chatbot = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [toolStatus, setToolStatus] = useState<ToolStatus | null>(null);
  const [sessionId, setSessionId] = useState('');
  const [isInputMultiline, setIsInputMultiline] = useState(false);
  const { textareaRef, autoResize } = useAutoResize();
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

  const hasStarted = messages.some((m) => m.role === 'user');

  // Initialize session ID on mount
  useEffect(() => {
    setSessionId(getOrCreateSessionId());
  }, []);

  // Load conversation from localStorage on mount
  useLoadConversation(setMessages);

  // Save conversation to localStorage whenever it changes
  useSaveConversation(messages);

  // Auto-scroll only when user sends a message
  // Don't scroll while LLM is streaming (isLoading=true) or after it finishes
  // Let user read at their own pace without being pushed around
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) return;

    // Only scroll if the last message is from the user (user just submitted)
    if (lastMessage.role === 'user') {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Re-check scroll position on every messages update so the button appears
  // immediately as streamed content grows past the viewport (no scroll event fires
  // when content grows — only when the user moves the scroll position).
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    setShowScrollButton(scrollHeight - scrollTop - clientHeight > 100);
  }, []);

  // Attach scroll listener so the button also reacts to user-initiated scrolls
  useEffect(() => {
    if (!hasStarted) {
      setShowScrollButton(false);
      return;
    }
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      setShowScrollButton(scrollHeight - scrollTop - clientHeight > 100);
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [hasStarted]);

  // Keep input focused while LLM is responding (desktop only — avoid keyboard pop-ups on mobile)
  useEffect(() => {
    if (!isLoading || !textareaRef.current) return;

    // Only apply on desktop (viewport width > 768px)
    const isDesktop = window.matchMedia('(min-width: 769px)').matches;
    if (!isDesktop) return;

    // Only refocus if nothing else is focused (user didn't click elsewhere)
    const focusInterval = setInterval(() => {
      if (textareaRef.current && document.activeElement !== textareaRef.current) {
        // Only refocus if the currently focused element is not an interactive element
        const focused = document.activeElement as HTMLElement;
        if (
          !focused ||
          (focused.tagName !== 'BUTTON' && focused.tagName !== 'A' && !focused.closest('button'))
        ) {
          textareaRef.current?.focus();
        }
      }
    }, 500);

    return () => clearInterval(focusInterval);
  }, [isLoading, textareaRef.current]);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;

    // On mobile, blur the textarea when sending the first message to close keyboard
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    if (isMobile && !hasStarted && textareaRef.current) {
      // Use setTimeout to ensure blur happens after any auto-focusing
      setTimeout(() => {
        textareaRef.current?.blur();
      }, 0);
    }

    // Abort any in-flight request and immediately clean up its incomplete message
    // so the new message is appended to a clean state.
    if (abortControllerRef.current && isLoading) {
      abortControllerRef.current.abort();
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        return last?.role === 'assistant' ? prev.slice(0, -1) : prev;
      });
      setSuggestions([]);
      setToolStatus(null);
    }

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    setSuggestions([]);

    // Create controller before the try block so finally can compare it
    // against abortControllerRef to detect whether a newer request has started.
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: '',
      };

      setMessages((prev) => [...prev, assistantMessage]);

      const response = await fetch(`${apiUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage].map((msg) => ({
            role: msg.role,
            content: msg.content,
          })),
          sessionId,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let contentBuffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        contentBuffer += chunk;

        // Update tool status based on markers in the content buffer
        const toolStatus = getToolStatusFromBuffer(contentBuffer);
        setToolStatus(toolStatus);

        // Strip tool markers and extract main content
        let displayContent = stripToolMarkers(contentBuffer);
        displayContent = convertSeparatorsToBlankLines(displayContent);
        displayContent = extractMainContent(displayContent);

        // Clean and format the display content
        displayContent = cleanDisplayContent(displayContent);
        // Skip addBlankLinesBetweenParagraphs - it breaks list formatting by adding
        // blank lines between bullet markers and their content. CSS margins handle spacing.
        displayContent = fixSpacing(displayContent);

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessage.id ? { ...msg, content: displayContent } : msg,
          ),
        );
      }

      // Clear tool status when streaming finishes
      setToolStatus(null);

      // Parse sources from the ---SOURCES--- section
      const parsedSources = extractSources(contentBuffer) ?? [];
      if (parsedSources.length > 0) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessage.id ? { ...msg, sources: parsedSources } : msg,
          ),
        );
      }

      // Parse suggestions from after the delimiter
      const parsedSuggestions = extractSuggestions(contentBuffer, SUGGESTIONS_DELIMITER);
      if (parsedSuggestions) {
        setSuggestions(parsedSuggestions);
      } else {
        console.debug('[chat] No suggestions found in response');
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // Incomplete message and loading state were already cleaned up
        // synchronously when the new sendMessage call triggered the abort.
        return;
      }

      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `[Error: ${error instanceof Error ? error.message : 'Failed to get response'}]`,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      // Only reset loading if no newer request has replaced this one.
      // If a new sendMessage started, abortControllerRef.current will be a
      // different controller and we must leave isLoading=true for that request.
      if (abortControllerRef.current === controller) {
        setIsLoading(false);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    const text = input;
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setIsInputMultiline(false);
    sendMessage(text);
  };

  const inputForm = (maxWidth: string) => (
    <form onSubmit={handleSubmit} className={`${maxWidth} mx-auto w-full`}>
      <div
        className={`flex ${isInputMultiline ? 'items-start' : 'items-center'} gap-2 bg-white dark:bg-gray-800/70 border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-3 focus-within:border-primary focus-within:shadow-[0_0_20px_rgba(0,53,107,0.15)] dark:focus-within:shadow-[0_0_20px_rgba(0,53,107,0.4)] transition-all shadow-sm`}
      >
        <textarea
          ref={textareaRef}
          rows={1}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            autoResize();
            // leading-6 (24px) × 2 + py-2 top+bottom (16px) = 64px
            const ta = textareaRef.current;
            if (ta) setIsInputMultiline(ta.scrollHeight > 64);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="Ask a question..."
          aria-label="Ask a question"
          className="flex-1 resize-none bg-transparent text-lg md:text-lg leading-6 py-2 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none max-h-40 overflow-y-auto"
        />
        <SendButton disabled={!input.trim()} />
      </div>
    </form>
  );

  return (
    <section className="h-full flex flex-col bg-gray-50 dark:bg-transparent">
      {/* Header */}
      <header className="bg-white/95 dark:bg-gray-900/70 dark:backdrop-blur-md border-b border-gray-200 dark:border-gray-700/50 px-6 py-3 md:py-4 flex items-center justify-between">
        {/* Customize: Add your organization's logo or branding here */}
        <div className="text-lg font-semibold text-gray-900 dark:text-white">ClassDesk</div>
        {hasStarted ? (
          <button
            type="button"
            onClick={() => {
              setMessages([]);
              clearConversationStorage();
              setSessionId(getOrCreateSessionId());
            }}
            className="text-sm md:text-base px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            Clear
          </button>
        ) : (
          <Link
            href="/about"
            className="text-sm md:text-base text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors underline"
          >
            About
          </Link>
        )}
      </header>

      {!hasStarted ? (
        /* EMPTY STATE */
        <div className="flex-1 flex flex-col items-center justify-center gap-8 px-4">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
              Hi! I&apos;m ClassDesk
            </h2>
            <p className="text-gray-600 dark:text-gray-300">Your AI assistant</p>
          </div>
          {inputForm('max-w-xl md:max-w-2xl')}
          <div className="flex flex-wrap justify-center gap-2">
            {SUGGESTIONS.map((s) => (
              <SuggestionPill key={s} label={s} onClick={() => sendMessage(s)} />
            ))}
          </div>
        </div>
      ) : (
        /* CONVERSATION STATE */
        <>
          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto min-h-0 py-6">
            <div className="max-w-2xl md:max-w-4xl mx-auto w-full px-4 space-y-6">
              {messages.map((msg, idx) => {
                const isLastMessage = idx === messages.length - 1;
                return msg.role === 'user' ? (
                  <div key={msg.id} className="flex justify-end">
                    <div className="bg-gradient-to-br from-primary to-primary-mid text-white rounded-2xl px-4 py-2.5 max-w-[75%] text-base md:text-base shadow-md">
                      {msg.content}
                    </div>
                  </div>
                ) : (
                  <div key={msg.id} className="max-w-[85%]">
                    <div className="bg-white dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700/40 rounded-2xl px-4 py-3 shadow-sm text-gray-800 dark:text-gray-100 text-base md:text-base leading-relaxed">
                      {isLoading && !msg.content ? (
                        <ToolStatusIndicator toolStatus={toolStatus} variant="typing" />
                      ) : (
                        <div className="prose prose-base md:prose-base dark:prose-invert max-w-none prose-p:my-16 prose-headings:mt-4 prose-headings:mb-2 prose-ul:my-2 prose-ul:pl-5 prose-ol:my-2 prose-ol:pl-5 prose-li:my-1 [&_li_p]:my-0 prose-blockquote:my-3 [&_blockquote_p]:my-1 [&_td_p]:my-0 [&_th_p]:my-0 prose-code:bg-gray-200 dark:prose-code:bg-gray-700 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-a:text-primary dark:prose-a:text-primary-light animate-fade-in">
                          <Markdown
                            remarkPlugins={[
                              remarkGfm,
                              [remarkCitations, { sources: msg.sources ?? [] }],
                            ]}
                            components={markdownComponents}
                          >
                            {msg.content}
                          </Markdown>
                        </div>
                      )}
                    </div>
                    {/* Tool status indicator — shown below card during mid-response tool calls */}
                    {isLoading && isLastMessage && msg.content && (
                      <ToolStatusIndicator
                        toolStatus={toolStatus}
                        variant="inline"
                        className="mt-3"
                      />
                    )}
                  </div>
                );
              })}
              {/* Follow-up suggestion pills */}
              {!isLoading && suggestions.length > 0 && (
                <div className="flex flex-wrap gap-2 animate-fade-in">
                  {suggestions.map((s) => (
                    <SuggestionPill key={s} label={s} onClick={() => sendMessage(s)} />
                  ))}
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          </div>
          {/* Input — fixed at bottom, clear iOS home indicator */}
          <div className="relative bg-gray-50/95 dark:bg-gray-900/70 dark:backdrop-blur-md border-t border-gray-200 dark:border-gray-700/50 px-4 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
            {showScrollButton && <ScrollToBottomButton onClick={scrollToBottom} />}
            {inputForm('max-w-2xl md:max-w-4xl')}
          </div>
        </>
      )}
    </section>
  );
};

export default Chatbot;

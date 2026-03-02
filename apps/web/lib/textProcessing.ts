/**
 * Utilities for processing streaming text responses from the API
 */

export interface ToolStatus {
  label: string;
  duration?: number; // undefined = still running
}

const TOOL_START_RE = /\[TOOL_START:(\w+)(?:\s+for\s+"([^"]*)")?\]/g;
const TOOL_END_RE = /\[TOOL_END:(\w+):([0-9.]+)s\]/g;

/**
 * Get the current tool status by parsing tool markers in the content buffer
 * Returns the tool that's currently running or just finished
 */
export const getToolStatusFromBuffer = (contentBuffer: string): ToolStatus | null => {
  // Find the LAST tool start and end markers to get current state
  let lastStart: RegExpExecArray | null = null;
  let lastEnd: RegExpExecArray | null = null;
  TOOL_START_RE.lastIndex = 0;
  TOOL_END_RE.lastIndex = 0;

  let m: RegExpExecArray | null;
  m = TOOL_START_RE.exec(contentBuffer);
  while (m !== null) {
    lastStart = m;
    m = TOOL_START_RE.exec(contentBuffer);
  }
  m = TOOL_END_RE.exec(contentBuffer);
  while (m !== null) {
    lastEnd = m;
    m = TOOL_END_RE.exec(contentBuffer);
  }

  // Determine current tool state from marker positions
  if (lastStart && (!lastEnd || lastStart.index > lastEnd.index)) {
    // A tool started after the last tool ended — tool is running
    const toolName = lastStart[1];
    const query = lastStart[2];
    const label = buildToolLabel(toolName, query, false);
    return { label };
  } else if (lastEnd && (!lastStart || lastEnd.index > lastStart.index)) {
    // The most recent event is a tool completing
    const toolName = lastEnd[1];
    const duration = parseFloat(lastEnd[2]);
    const label = buildToolLabel(toolName, undefined, true);
    return { label, duration };
  }

  return null;
};

/**
 * Build a human-readable label for a tool based on its name
 */
const buildToolLabel = (
  toolName: string,
  query: string | undefined,
  isCompleted: boolean,
): string => {
  const queryPart = query ? ` for "${query}"` : '';

  if (toolName === 'search_documents') {
    return isCompleted ? 'Searched documents' : `Searching documents${queryPart}`;
  }
  if (toolName === 'web_search') {
    return isCompleted ? 'Searched the web' : `Searching the web${queryPart}`;
  }
  if (toolName === 'fetch_url') {
    return isCompleted ? 'Fetched page' : `Fetching page${queryPart}`;
  }
  if (toolName === 'fill_form') {
    if (query === 'fill-monday-form-1') {
      return isCompleted ? 'Submitted form 1' : 'Submitting form 1';
    }
    if (query === 'fill-monday-form-2') {
      return isCompleted ? 'Submitted form 2' : 'Submitting form 2';
    }
    return isCompleted ? 'Submitted form' : 'Submitting form';
  }
  return `${isCompleted ? 'Ran' : 'Running'} ${toolName}${queryPart}`;
};

/**
 * Strip all tool markers from content (both START and END markers)
 */
export const stripToolMarkers = (content: string): string => {
  return content
    .replace(/\[TOOL_START:\w+(?:\s+for\s+"[^"]*")?\]/g, '')
    .replace(/\[TOOL_END:\w+:[0-9.]+s\]/g, '');
};

export type SourceEntry =
  | { type: 'document'; title: string; slug: string }
  | { type: 'web'; title: string | null; url: string };

const SOURCES_DELIMITER = '\n\n---SOURCES---\n';
const SUGGESTIONS_DELIMITER_INTERNAL = '\n\n---SUGGESTIONS---\n';

/**
 * Extract the main response content, stripping sources and suggestions sections
 */
export const extractMainContent = (content: string): string => {
  const srcIdx = content.indexOf(SOURCES_DELIMITER);
  const sugIdx = content.indexOf(SUGGESTIONS_DELIMITER_INTERNAL);
  const candidates = [srcIdx, sugIdx].filter((i) => i >= 0);
  if (candidates.length === 0) return content;
  return content.slice(0, Math.min(...candidates));
};

/**
 * Extract sources from the ---SOURCES--- section of the content buffer
 */
export const extractSources = (content: string): SourceEntry[] | null => {
  const srcIdx = content.indexOf(SOURCES_DELIMITER);
  if (srcIdx < 0) return null;
  try {
    const sugIdx = content.indexOf(SUGGESTIONS_DELIMITER_INTERNAL, srcIdx);
    const json =
      sugIdx > 0
        ? content.slice(srcIdx + SOURCES_DELIMITER.length, sugIdx).trim()
        : content.slice(srcIdx + SOURCES_DELIMITER.length).trim();
    if (!json) return null;
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

/**
 * Extract suggestions JSON from after the delimiter
 */
export const extractSuggestions = (content: string, delimiter: string): string[] | null => {
  const delimiterIdx = content.indexOf(delimiter);
  if (delimiterIdx < 0) {
    return null;
  }

  try {
    const suggestionsJson = content.slice(delimiterIdx + delimiter.length).trim();
    if (!suggestionsJson) return null;

    const parsed = JSON.parse(suggestionsJson) as unknown;
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch (error) {
    console.warn('[chat] Failed to parse suggestions:', error);
  }

  return null;
};

/**
 * Strip tool markers that might have created extra newlines
 * Let "---" pass through to render as <hr>, styled with CSS for spacing
 */
export const convertSeparatorsToBlankLines = (content: string): string => {
  return content;
};

/**
 * Clean up the display content by removing excessive whitespace and tool markers
 */
export const cleanDisplayContent = (content: string): string => {
  // Collapse 3+ consecutive newlines to 2 (removes excessive blank lines from tool marker removal)
  let cleaned = content.replace(/\n{3,}/g, '\n\n').trim();

  // When a tool marker is stripped from immediately after a list bullet
  // (e.g. "- [TOOL_START:search]\ntext"), the marker removal leaves the bullet
  // with nothing on its line ("- \ntext"). CommonMark parses that as an empty
  // list item followed by a separate paragraph, producing a blank bullet then
  // the text below it. Collapse the dangling newline so the content stays on
  // the same line as the marker.
  cleaned = cleaned.replace(/^([-*+]|\d+\.) +\n(?=[^\n])/gm, '$1 ');

  return cleaned;
};

/**
 * Text formatting utilities for chat responses
 */

/**
 * Add blank lines between consecutive paragraphs
 * Ensures readability by separating text blocks visually
 * BUT: Don't add blank lines before Markdown list items (lines starting with - or *)
 */
export const addBlankLinesBetweenParagraphs = (text: string): string => {
  // Match any non-newline followed by newline followed by another non-newline
  // EXCEPT if the next line is a Markdown list item (starts with - or *)
  // Replace with double newline to create blank line between paragraphs
  return text.replace(/([^\n])\n(?=(?![-*]\s)[^\n])/g, '$1\n\n');
};

/**
 * Fix spacing after periods and colons
 * Strategy: extract emails and URLs first, protect them, apply spacing to remaining text, then restore them
 */
export const fixSpacing = (text: string): string => {
  // Regex patterns for emails and URLs
  const emailRegex = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;

  // Extract and store emails and URLs
  const placeholders: { [key: string]: string } = {};
  let placeholderIndex = 0;
  const createPlaceholder = (content: string): string => {
    const placeholder = `__PLACEHOLDER_${placeholderIndex}__`;
    placeholders[placeholder] = content;
    placeholderIndex++;
    return placeholder;
  };

  // First extract URLs (they often contain emails in query params, so do this first)
  let protectedText = text.replace(urlRegex, (match) => createPlaceholder(match));

  // Then extract remaining emails
  protectedText = protectedText.replace(emailRegex, (match) => createPlaceholder(match));

  // Now apply spacing fix to the remaining text
  const fixed = protectedText.replace(/\.([A-Za-z0-9])/g, (_match, letter) => {
    // Don't add space if followed by a placeholder (which was a URL or email)
    return `. ${letter}`;
  });

  // Restore all emails and URLs
  let result = fixed;
  Object.entries(placeholders).forEach(([placeholder, original]) => {
    result = result.replace(placeholder, original);
  });

  return result;
};

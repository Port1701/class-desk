/**
 * Text search utilities for hybrid RAG.
 * Provides fuzzy keyword extraction, context window extraction (40-word windows
 * around keyword matches with typo tolerance), and date parsing.
 */

// Common English stop words to ignore when extracting search keywords
const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'not',
  'no',
  'nor',
  'so',
  'yet',
  'for',
  'of',
  'in',
  'on',
  'at',
  'to',
  'by',
  'as',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'must',
  'shall',
  'can',
  'i',
  'me',
  'my',
  'we',
  'our',
  'you',
  'your',
  'he',
  'she',
  'it',
  'they',
  'them',
  'its',
  'his',
  'her',
  'their',
  'this',
  'that',
  'these',
  'those',
  'which',
  'who',
  'whom',
  'what',
  'where',
  'when',
  'why',
  'how',
  'if',
  'then',
  'than',
  'up',
  'out',
  'with',
  'from',
  'about',
  'there',
  'here',
  'any',
  'all',
  'more',
  'just',
  'also',
  'get',
  'go',
  'tell',
  'let',
  'know',
  'need',
  'want',
  'use',
  'see',
  'well',
  'please',
  'hi',
  'hello',
  'thanks',
  'thank',
  'okay',
  'ok',
  'yes',
  'yeah',
  'much',
  'very',
  'good',
  'great',
  'some',
  'like',
  'into',
]);

/**
 * Extract meaningful keywords from a user query, removing stop words.
 * Deduplicates and returns words with 3+ characters.
 */
export const extractKeywords = (query: string): string[] => {
  const seen = new Set<string>();
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((word) => {
      if (word.length < 3) return false;
      if (STOP_WORDS.has(word)) return false;
      if (seen.has(word)) return false;
      seen.add(word);
      return true;
    });
};

/** Levenshtein edit distance (space-optimized O(min(m,n)) extra space). */
const levenshteinDistance = (a: string, b: string): number => {
  if (a.length < b.length) [a, b] = [b, a];
  const n = b.length;
  const row = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = row[j];
      row[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, row[j], row[j - 1]);
      prev = temp;
    }
  }
  return row[n];
};

/**
 * Find all positions in `content` where a word fuzzy-matches `keyword`
 * (tolerates typos: 1 edit per 4 chars, min 1, max 3), then return
 * 40-word context windows (20 before + 20 after) around each match.
 * Overlapping windows are merged into a single excerpt.
 */
export const extractContextWindows = (
  content: string,
  keyword: string,
  windowSize = 20,
): string[] => {
  const words = content.split(/\s+/);
  const kw = keyword.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!kw || kw.length < 2) return [];

  // Allow 1 edit per 4 chars (min 1, max 3)
  const maxDist = Math.min(3, Math.max(1, Math.floor(kw.length / 4)));

  // Collect [start, end] index ranges for each match
  const ranges: Array<[number, number]> = [];
  for (let i = 0; i < words.length; i++) {
    const word = words[i].toLowerCase().replace(/[^a-z0-9]/g, '');
    if (word.length < 2) continue;
    // Length shortcut: skip if length difference exceeds maxDist
    if (Math.abs(word.length - kw.length) > maxDist) continue;
    if (levenshteinDistance(word, kw) <= maxDist) {
      ranges.push([Math.max(0, i - windowSize), Math.min(words.length - 1, i + windowSize)]);
    }
  }
  if (ranges.length === 0) return [];

  // Merge overlapping or adjacent ranges
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [ranges[0]];
  for (const [start, end] of ranges.slice(1)) {
    const last = merged[merged.length - 1];
    if (start <= last[1] + 1) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }

  return merged.map(([start, end]) => words.slice(start, end + 1).join(' '));
};

/**
 * Extract dates in X/Y/Z format (e.g. 5/17/2026, 12/1/26) from text.
 * Returns deduplicated list.
 */
export const extractDates = (text: string): string[] => {
  const seen = new Set<string>();
  for (const match of text.matchAll(/\b(\d{1,2}\/\d{1,2}\/(?:\d{2}|\d{4}))\b/g)) {
    seen.add(match[1]);
  }
  return [...seen];
};

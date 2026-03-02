/**
 * Remark plugin to transform [N] citation markers into link MDAST nodes.
 * Accepts a sources array and maps each [N] to the corresponding /docs/:slug URL.
 * Uses link nodes (natively handled by react-markdown) instead of raw HTML
 * to avoid requiring rehype-raw and introducing XSS surface area.
 */

import type { SourceEntry } from '@/lib/textProcessing';

interface RemarkCitationsOptions {
  sources: SourceEntry[];
}

// Split a text string on [N] patterns → array of text and link nodes.
// [N] markers that don't map to a known doc source are left as plain text.
const splitCitations = (value: string, sources: SourceEntry[]): unknown[] => {
  const nodes: unknown[] = [];
  const regex = /\[(\d+)\]/g;
  let last = 0;
  let match: RegExpExecArray | null = regex.exec(value);
  while (match !== null) {
    const num = parseInt(match[1], 10);
    const source = sources[num - 1]; // 1-based index
    const slug = source?.type === 'document' ? source.slug : null;

    if (match.index > last) {
      nodes.push({ type: 'text', value: value.slice(last, match.index) });
    }

    if (slug) {
      // Use a #cite: prefix so the custom `a` component can detect citations
      // and render them as superscripts opening in a new tab
      nodes.push({
        type: 'link',
        url: `#cite:/docs/${slug}`,
        children: [{ type: 'text', value: match[1] }],
      });
    } else {
      // No matching source — leave as plain text
      nodes.push({ type: 'text', value: match[0] });
    }

    last = regex.lastIndex;
    match = regex.exec(value);
  }
  if (last < value.length) {
    nodes.push({ type: 'text', value: value.slice(last) });
  }
  return nodes;
};

// Recursive tree walker — replaces children in-place, never mutates while iterating.
// Does NOT recurse into `link` nodes to prevent nested <a> tags.
// Also handles the edge case where remark-gfm's autolink literal absorbs [N] into
// the link URL (e.g. **https://bit.ly/y21-calendar**[1] → url ends with "[1]").
const walkTree = (
  node: { type: string; children?: unknown[]; value?: string },
  sources: SourceEntry[],
): void => {
  if (!node.children) return;
  const newChildren: unknown[] = [];
  for (const child of node.children) {
    const c = child as { type: string; children?: unknown[]; value?: string; url?: string };
    if (c.type === 'text' && c.value && /\[\d+\]/.test(c.value)) {
      newChildren.push(...splitCitations(c.value, sources));
    } else if (c.type === 'link' && c.url) {
      // Check if the URL erroneously ends with [N] (autolink literal absorbed citation marker)
      const urlCiteMatch = /^(.*?)\[(\d+)\]$/.exec(c.url);
      if (urlCiteMatch) {
        const cleanUrl = urlCiteMatch[1];
        const num = parseInt(urlCiteMatch[2], 10);
        const source = sources[num - 1];
        const slug = source?.type === 'document' ? source.slug : null;

        // Strip [N] from the link's display text (children) too
        const fixedChildren = ((c.children ?? []) as { type: string; value?: string }[]).map(
          (ch) =>
            ch.type === 'text' && ch.value
              ? { ...ch, value: ch.value.replace(/\[\d+\]$/, '') }
              : ch,
        );

        newChildren.push({ ...c, url: cleanUrl, children: fixedChildren });

        // Inject citation as a sibling after the link
        if (slug) {
          newChildren.push({
            type: 'link',
            url: `#cite:/docs/${slug}`,
            children: [{ type: 'text', value: String(num) }],
          });
        } else {
          newChildren.push({ type: 'text', value: `[${num}]` });
        }
      } else {
        // Normal link — do NOT recurse inside (prevents nested <a> tags)
        newChildren.push(c);
      }
    } else {
      walkTree(c, sources);
      newChildren.push(c);
    }
  }
  node.children = newChildren;
};

export const remarkCitations =
  ({ sources = [] }: RemarkCitationsOptions = { sources: [] }) =>
  (tree: unknown) => {
    walkTree(tree as { type: string; children?: unknown[] }, sources);
  };

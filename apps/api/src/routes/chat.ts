import { anthropic } from '@ai-sdk/anthropic';
import { propagateAttributes, startActiveObservation } from '@langfuse/tracing';
import { generateObject, type ModelMessage, stepCountIs, streamText, type ToolSet, tool } from 'ai';
import { Router } from 'express';
import { z } from 'zod';
import { generateEmbedding, isEmbeddingsAvailable } from '@/services/embeddings.js';
import { type FetchUrlResult, fetchUrl } from '@/services/fetchUrl.js';
import {
  type FormFillResult,
  fillMondayForm2,
  fillMondayForm1,
} from '@/services/formFiller.js';
import { getSuggestionsPrompt, getSystemPrompt } from '@/services/langfuse.js';
import { getSupabaseClient } from '@/services/supabase.js';
import { extractContextWindows, extractDates, extractKeywords } from '@/services/textSearch.js';

const SUGGESTIONS_DELIMITER = '\n\n---SUGGESTIONS---\n';
const SOURCES_DELIMITER = '\n\n---SOURCES---\n';
const SUGGESTIONS_TIMEOUT_MS = 5000;

const SuggestionsSchema = z.object({
  suggestions: z.array(z.string().max(80)).min(1),
});

type DocSource = { type: 'document'; title: string; slug: string };
type WebSource = { type: 'web'; title: string | null; url: string };
type SourceEntry = DocSource | WebSource;

const router = Router();

// A single result entry from the vector chunk search (one doc, up to 3 chunks combined)
interface ChunkResult {
  num: number;
  title: string;
  slug: string;
  content: string; // up to 3 most-relevant chunks joined with "---"
  relevance: number;
}

// A fuzzy keyword match: 40-word context windows around each occurrence in a doc
interface FuzzySnippet {
  num: number;
  title: string;
  slug: string;
  keyword: string;
  contexts: string[]; // 40-word windows (20 before + 20 after) around each match
  dates: string[]; // X/Y/Z dates mentioned anywhere in the document
}

interface SearchDocumentsResult {
  results: ChunkResult[];
  snippets?: FuzzySnippet[];
  error?: string;
}

const buildSearchDocumentsTool = (collectedSources: SourceEntry[]) =>
  tool({
    description:
      'Search the ClassDesk knowledge base for documents, events, and other class-specific information. Use this before web search for class-related questions. ' +
      'Returns two complementary signals: ' +
      '`results` are semantically similar document chunks (use for broad understanding and context); ' +
      '`snippets` are precise 40-word keyword-matched windows from documents with nearby dates (use for specific facts, exact wording, and deadlines).',
    inputSchema: z.object({
      query: z
        .string()
        .describe('The search query to find relevant documents in the knowledge base'),
    }),
    execute: async ({ query }: { query: string }): Promise<SearchDocumentsResult> => {
      try {
        const supabase = getSupabaseClient();
        if (!supabase) {
          return { results: [], error: 'Document search temporarily unavailable' };
        }

        // ── 1. VECTOR SEARCH over chunks ─────────────────────────────────────
        const embedding = await generateEmbedding(query);
        if (!embedding) {
          return { results: [], error: 'Unable to process search query' };
        }

        const { data: chunkData, error: chunkError } = await supabase.rpc('match_chunks', {
          query_embedding: embedding,
          match_threshold: 0.4,
          match_count: 30,
        });

        if (chunkError) {
          console.error('[search_documents] match_chunks RPC error:', chunkError);
          return { results: [], error: 'Document search temporarily unavailable' };
        }

        // Group chunks by doc slug (max 3 chunks per doc, highest similarity first).
        // Assign citation numbers and collect sources deduplicated by slug.
        type ChunkRow = { title: string; slug: string; chunk_content: string; similarity: number };
        const docMap = new Map<
          string,
          { title: string; slug: string; chunks: string[]; maxSim: number }
        >();
        for (const chunk of (chunkData ?? []) as ChunkRow[]) {
          if (!chunk.slug) continue;
          const existing = docMap.get(chunk.slug);
          if (existing) {
            if (existing.chunks.length < 3) existing.chunks.push(chunk.chunk_content);
            existing.maxSim = Math.max(existing.maxSim, chunk.similarity);
          } else {
            docMap.set(chunk.slug, {
              title: chunk.title,
              slug: chunk.slug,
              chunks: [chunk.chunk_content],
              maxSim: chunk.similarity,
            });
            if (!collectedSources.some((s) => s.type === 'document' && s.slug === chunk.slug)) {
              collectedSources.push({ type: 'document', title: chunk.title, slug: chunk.slug });
            }
          }
        }
        const results: ChunkResult[] = [...docMap.values()].map((doc) => ({
          num: collectedSources.findIndex((s) => s.type === 'document' && s.slug === doc.slug) + 1,
          title: doc.title,
          slug: doc.slug,
          content: doc.chunks.join('\n\n---\n\n'),
          relevance: doc.maxSim,
        }));

        // ── 2. FUZZY TEXT SEARCH (keyword + typo-tolerant) ───────────────────
        const keywords = extractKeywords(query).slice(0, 3); // cap at 3 keywords
        const snippets: FuzzySnippet[] = [];

        for (const keyword of keywords) {
          const { data: fuzzyDocs, error: fuzzyError } = await supabase.rpc(
            'search_documents_fuzzy',
            {
              keyword,
              word_sim_threshold: 0.35,
              match_count: 5,
            },
          );
          if (fuzzyError) {
            console.warn('[search_documents] fuzzy RPC error:', fuzzyError);
            continue;
          }
          for (const doc of (fuzzyDocs ?? []) as {
            id: string;
            title: string;
            content: string;
            slug: string;
          }[]) {
            const contexts = extractContextWindows(doc.content, keyword);
            if (contexts.length === 0) continue;

            if (
              doc.slug &&
              !collectedSources.some((s) => s.type === 'document' && s.slug === doc.slug)
            ) {
              collectedSources.push({ type: 'document', title: doc.title, slug: doc.slug });
            }
            snippets.push({
              num:
                collectedSources.findIndex((s) => s.type === 'document' && s.slug === doc.slug) + 1,
              title: doc.title,
              slug: doc.slug,
              keyword,
              contexts,
              dates: extractDates(doc.content),
            });
          }
        }

        return { results, snippets: snippets.length > 0 ? snippets : undefined };
      } catch (error) {
        console.error('[search_documents] Error:', error);
        return { results: [], error: 'Document search temporarily unavailable' };
      }
    },
  });

const buildFillFormTool = () =>
  tool({
    description:
      'Submit a Monday.com form on behalf of the user. ' +
      'IMPORTANT: You MUST present a full summary of the data to the user and receive their explicit confirmation BEFORE calling this tool. Never call this speculatively or mid-collection. ' +
      "Available forms: 'fill-monday-form-1' and 'fill-monday-form-2'.",
    inputSchema: z.object({
      formType: z
        .enum(['fill-monday-form-1', 'fill-monday-form-2'])
        .describe('Which form to fill'),
      name: z
        .string()
        .max(255)
        .optional()
        .describe('Full name of the person requesting'),
      email: z.string().email().optional().describe('Email address'),
      phone: z.string().optional().describe('Cell phone number'),
      groupSize: z
        .union([z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)])
        .optional()
        .describe('Total number of people in the group'),
      memberName: z
        .string()
        .optional()
        .describe('Name of the member whose record needs updating'),
      classYear: z
        .string()
        .optional()
        .describe('The class year of the member'),
      newEmail: z
        .string()
        .email()
        .optional()
        .describe("The member's new email address"),
    }),
    execute: async (input): Promise<FormFillResult> => {
      if (input.formType === 'fill-monday-form-1') {
        if (!input.name || !input.email || !input.phone || !input.groupSize) {
          throw new Error('Missing required fields for Monday Form 1');
        }
        return fillMondayForm1({
          name: input.name,
          email: input.email,
          phone: input.phone,
          groupSize: input.groupSize as 2 | 3 | 4 | 5 | 6,
        });
      }
      if (!input.memberName || !input.classYear || !input.newEmail) {
        throw new Error('Missing required fields for Monday Form 2');
      }
      return fillMondayForm2({
        memberName: input.memberName,
        classYear: input.classYear,
        newEmail: input.newEmail,
      });
    },
  });

const buildFetchUrlTool = () =>
  tool({
    description:
      'Fetch a web page and extract its text content. Use this when you have a specific URL to read. Prefer search_documents for class-specific questions and web_search for discovering URLs.',
    inputSchema: z.object({
      url: z.string().url().describe('The full URL to fetch'),
    }),
    execute: async ({ url }: { url: string }): Promise<FetchUrlResult> => {
      return fetchUrl(url);
    },
  });

router.post('/', async (req, res) => {
  const { messages, sessionId } = req.body ?? {};

  // Validate before streaming (once SSE headers are sent, we can't change status code)
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'messages array is required and must not be empty' });
    return;
  }

  // AbortController for client disconnect
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) {
      controller.abort();
    }
  });

  // Per-request source collection
  const collectedSources: SourceEntry[] = [];

  try {
    const currentDate = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'America/New_York',
    });
    const { text: systemPrompt } = await getSystemPrompt({ currentDate });

    // Build tools — conditionally include search_documents
    const tools: ToolSet = {
      web_search: anthropic.tools.webSearch_20250305({ maxUses: 3 }),
      fetch_url: buildFetchUrlTool(),
      fill_form: buildFillFormTool(),
      ...(isEmbeddingsAvailable() && {
        search_documents: buildSearchDocumentsTool(collectedSources),
      }),
    };

    await startActiveObservation('chat-request', async (span) => {
      span.update({ input: { messages } });

      const traceAttrs = sessionId ? { sessionId: String(sessionId) } : {};

      await propagateAttributes(traceAttrs, async () => {
        const result = await streamText({
          model: anthropic('claude-haiku-4-5'),
          system: systemPrompt,
          messages: messages as ModelMessage[],
          tools,
          stopWhen: stepCountIs(5),
          abortSignal: controller.signal,
          experimental_telemetry: {
            isEnabled: true,
            functionId: 'chat-streamText',
            metadata: { messageCount: String(messages.length) },
          },
        });

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');

        let fullText = '';
        const toolStartTimes = new Map<string, number>();

        // Use fullStream to get access to tool execution events and text deltas
        // Event types from TextStreamPart<TOOLS>:
        //   text-delta  → { type, text: string }
        //   tool-call   → { type, toolName: string, input: unknown }
        //   tool-result → { type, toolName: string, result: unknown }
        for await (const event of result.fullStream) {
          // If abort signal was fired, stop processing immediately
          if (controller.signal.aborted) {
            break;
          }

          if (event.type === 'tool-call') {
            const { toolName, input } = event as unknown as {
              toolName: string;
              input: Record<string, unknown>;
            };
            // Extract a display value for the tool status indicator
            const displayValue =
              input && typeof input === 'object'
                ? 'url' in input
                  ? String(input.url).slice(0, 100)
                  : 'query' in input
                    ? String(input.query).slice(0, 100)
                    : 'formType' in input
                      ? String(input.formType)
                      : undefined
                : undefined;

            toolStartTimes.set(toolName, Date.now());
            // Escape quotes in the displayValue to avoid breaking the marker delimiter
            const safeDisplayValue = displayValue?.replace(/"/g, "'");
            const displayPart = safeDisplayValue ? ` for "${safeDisplayValue}"` : '';
            res.write(`\n[TOOL_START:${toolName}${displayPart}]\n`);
          } else if (event.type === 'tool-result') {
            const { toolName, result: toolResult } = event as unknown as {
              toolName: string;
              result: unknown;
            };
            const startTime = toolStartTimes.get(toolName);
            if (startTime) {
              const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
              res.write(`[TOOL_END:${toolName}:${durationSec}s]\n`);
              toolStartTimes.delete(toolName);
            }
            // Collect web search sources (best-effort)
            if (toolName === 'web_search') {
              try {
                const resultObj = toolResult as Record<string, unknown> | null;
                const items = Array.isArray(resultObj?.content) ? resultObj.content : [];
                for (const item of items) {
                  const itemObj = item as Record<string, unknown> | null;
                  if (
                    typeof itemObj?.url === 'string' &&
                    !collectedSources.some((s) => s.type === 'web' && s.url === itemObj.url)
                  ) {
                    collectedSources.push({
                      type: 'web',
                      title: typeof itemObj.title === 'string' ? itemObj.title : null,
                      url: itemObj.url,
                    });
                  }
                }
              } catch {
                /* web sources are best-effort */
              }
            }
          } else if (event.type === 'text-delta') {
            // Text delta — the actual LLM-generated text content
            const { text } = event as unknown as { text: string };
            res.write(text);
            fullText += text;
          }
        }

        // Write sources before suggestions (abort-guarded)
        if (!controller.signal.aborted && collectedSources.length > 0) {
          res.write(SOURCES_DELIMITER + JSON.stringify(collectedSources));
        }

        // Generate follow-up suggestions (non-blocking — failures are silent)
        try {
          const { text: suggestionsSystemPrompt } = await getSuggestionsPrompt();

          // Use last 4 messages for context
          const recentMessages = (messages as ModelMessage[]).slice(-4);

          const suggestionsResult = await Promise.race([
            generateObject({
              model: anthropic('claude-haiku-4-5'),
              system: suggestionsSystemPrompt,
              messages: recentMessages,
              schema: SuggestionsSchema,
              temperature: 0.7,
              experimental_telemetry: {
                isEnabled: true,
                functionId: 'chat-generateSuggestions',
              },
            }),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Suggestions timeout')), SUGGESTIONS_TIMEOUT_MS),
            ),
          ]).then((result) => result.object);

          res.write(SUGGESTIONS_DELIMITER + JSON.stringify(suggestionsResult.suggestions));
        } catch (error) {
          console.warn(
            `[chat] Suggestions generation skipped: ${error instanceof Error ? error.message : String(error)}`,
          );
        }

        span.update({ output: { text: fullText } });
      });
    });

    res.end();
  } catch (error) {
    // If headers not yet sent, return JSON error
    if (!res.headersSent) {
      console.error('[POST /chat] Error:', error);
      res.status(500).json({ error: 'Chat request failed' });
    }
    // If headers already sent (mid-stream error), connection is already closed
  }
});

export default router;

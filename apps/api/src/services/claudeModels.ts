import { startObservation } from '@langfuse/tracing';
import { z } from 'zod';

/**
 * Picks the newest Claude Haiku at runtime.
 *
 * The Anthropic API has no cross-version "latest Haiku" alias (each version is
 * a fixed id such as `claude-haiku-5-5`), so the newest one is found by asking
 * the Models API and choosing the newest eligible Haiku by `created_at`. The
 * answer is cached; a request after it goes stale starts a background lookup,
 * and the next request uses the result, so a new Haiku release reaches users
 * without a deploy and no request waits on the lookup.
 *
 * Eligibility fails closed: a model is used only when the API explicitly
 * reports what the chat route sends. A failed lookup, or one with no eligible
 * model, never fails a chat: the last good answer (or the pinned fallback
 * below) keeps serving, and the lookup is retried later.
 */

/** Used until the first lookup succeeds, and whenever lookups keep failing. */
export const FALLBACK_HAIKU_MODEL_ID = 'claude-haiku-5-5';

/**
 * What the chat route sends, shared so the eligibility check and the requests
 * cannot drift apart: this effort level on every call, and disabled thinking
 * on the suggestions call.
 */
export const ROUTE_EFFORT_LEVEL = 'low';
export const SUGGESTIONS_THINKING = { type: 'disabled' } as const;

const HAIKU_LINE = 'haiku';
const MODELS_URL = 'https://api.anthropic.com/v1/models';
// The version whose documented Models API response carries `line`,
// `lifecycle` and `capabilities`, which eligibility depends on.
const ANTHROPIC_VERSION = '2026-10-21';
const PAGE_LIMIT = 1000;
const MAX_PAGES = 10;
const DEFAULT_LOOKUP_TIMEOUT_MS = 5_000;
const INIT_DEADLINE_MS = 5_000;
export const REFRESH_AFTER_SUCCESS_MS = 6 * 60 * 60 * 1000;
export const RETRY_AFTER_FAILURE_MS = 10 * 60 * 1000;

/** What one lookup did, reported to `onLookup`. */
export type LookupResult =
  | { outcome: 'switched' | 'unchanged'; modelId: string; previousId: string }
  | { outcome: 'failed'; modelId: string; error: string };

/**
 * Records each lookup as a Langfuse event beside the LLM traces (a no-op when
 * Langfuse is not configured), so a failing lookup or a model switch is visible
 * there and not only in the server log. Failures are level WARNING: chat keeps
 * working on the current model.
 */
const reportLookupToLangfuse = (result: LookupResult): void => {
  startObservation(
    'claude-models.lookup',
    {
      level: result.outcome === 'failed' ? 'WARNING' : 'DEFAULT',
      statusMessage: result.outcome === 'failed' ? result.error : undefined,
      output: result,
    },
    { asType: 'event' },
  );
};

const SupportFlagSchema = z.object({ supported: z.boolean() }).nullable().optional();

// Only the fields the picker reads; everything else on a model is ignored.
// A model missing any of them still parses, but is never picked.
const ModelSchema = z.object({
  id: z.string(),
  created_at: z.string(),
  line: z.string().nullable().optional(),
  lifecycle: z.string().nullable().optional(),
  capabilities: z
    .object({
      effort: z
        .object({ [ROUTE_EFFORT_LEVEL]: SupportFlagSchema })
        .nullable()
        .optional(),
      thinking: z
        .object({ types: z.object({ disabled: SupportFlagSchema }).nullable().optional() })
        .nullable()
        .optional(),
    })
    .nullable()
    .optional(),
});

// Entries are validated one by one, so one malformed model is skipped instead
// of discarding the whole page.
const ModelsPageSchema = z.object({
  data: z.array(z.unknown()),
  has_more: z.boolean(),
  last_id: z.string().nullable().optional(),
});

type ModelSummary = z.infer<typeof ModelSchema>;

/**
 * A model the chat route can call: in the Haiku line, active, and reporting
 * support for the effort level every call sends (both calls) and for disabled
 * thinking (the suggestions call). The two flags are reported separately, so a
 * model that rejects only their combination is not detected here.
 */
const isEligibleHaiku = (model: ModelSummary): boolean =>
  model.line === HAIKU_LINE &&
  model.lifecycle === 'active' &&
  model.capabilities?.effort?.[ROUTE_EFFORT_LEVEL]?.supported === true &&
  model.capabilities?.thinking?.types?.disabled?.supported === true;

/**
 * The newest eligible Haiku, or null when there is none.
 *
 * Sorted here rather than trusting the API's list order. On a tie in
 * `created_at` the shorter id wins, so an undated alias beats its dated
 * snapshot; a tie in length falls back to alphabetical order so the answer is
 * deterministic.
 */
export const pickNewestHaiku = (models: readonly ModelSummary[]): string | null => {
  const candidates = models
    .filter(isEligibleHaiku)
    .map((model) => ({ id: model.id, createdAt: Date.parse(model.created_at) }))
    .filter((model) => Number.isFinite(model.createdAt));

  if (candidates.length === 0) {
    return null;
  }

  const newest = candidates.reduce((best, model) => {
    if (model.createdAt !== best.createdAt) {
      return model.createdAt > best.createdAt ? model : best;
    }
    if (model.id.length !== best.id.length) {
      return model.id.length < best.id.length ? model : best;
    }
    return model.id < best.id ? model : best;
  });
  return newest.id;
};

type ResolverOptions = {
  apiKey: string;
  fetchFn?: typeof fetch;
  now?: () => number;
  /** Per-request timeout; a seam for tests, defaulting to 5s. */
  lookupTimeoutMs?: number;
  /** Called after every lookup; defaults to recording a Langfuse event. */
  onLookup?: (result: LookupResult) => void;
};

/** Every model the key can see, following pagination up to MAX_PAGES. */
const listModels = async (
  apiKey: string,
  fetchFn: typeof fetch,
  lookupTimeoutMs: number,
): Promise<ModelSummary[]> => {
  const models: ModelSummary[] = [];
  let skipped = 0;
  let afterId: string | null = null;

  const collect = (entries: unknown[]) => {
    for (const entry of entries) {
      const parsed = ModelSchema.safeParse(entry);
      if (parsed.success) {
        models.push(parsed.data);
      } else {
        skipped++;
      }
    }
  };
  const finish = () => {
    if (skipped > 0) {
      console.warn(`[claude-models] skipped ${skipped} model(s) with an unexpected shape`);
    }
    return models;
  };

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(MODELS_URL);
    url.searchParams.set('limit', String(PAGE_LIMIT));
    if (afterId) {
      url.searchParams.set('after_id', afterId);
    }

    const response = await fetchFn(url, {
      headers: { 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION },
      signal: AbortSignal.timeout(lookupTimeoutMs),
    });
    if (!response.ok) {
      throw new Error(`Models API returned HTTP ${response.status}`);
    }

    const parsed = ModelsPageSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new Error(
        `Models API response did not match the expected shape: ${parsed.error.message}`,
      );
    }
    collect(parsed.data.data);
    if (!parsed.data.has_more) {
      return finish();
    }
    if (!parsed.data.last_id) {
      console.warn(
        '[claude-models] Models API said has_more with no last_id; using a partial list',
      );
      return finish();
    }
    afterId = parsed.data.last_id;
  }
  console.warn(
    `[claude-models] Models API listing stopped at ${MAX_PAGES} pages; using a partial list`,
  );
  return finish();
};

export const createHaikuModelResolver = ({
  apiKey,
  fetchFn = fetch,
  now = Date.now,
  lookupTimeoutMs = DEFAULT_LOOKUP_TIMEOUT_MS,
  onLookup = reportLookupToLangfuse,
}: ResolverOptions) => {
  let currentId = FALLBACK_HAIKU_MODEL_ID;
  let nextRefreshAt = 0;
  let inFlight: Promise<void> | null = null;

  // Reporting must never break model selection.
  const notify = (result: LookupResult) => {
    try {
      onLookup(result);
    } catch (error) {
      console.warn(
        `[claude-models] lookup report failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  /** Never throws; a failure keeps the current id and schedules a retry. */
  const refresh = (): Promise<void> => {
    if (inFlight) {
      return inFlight;
    }
    inFlight = (async () => {
      try {
        const newest = pickNewestHaiku(await listModels(apiKey, fetchFn, lookupTimeoutMs));
        if (!newest) {
          throw new Error('Models API listed no eligible Claude Haiku');
        }
        const previousId = currentId;
        if (newest !== previousId) {
          console.log(`[claude-models] Haiku model: ${previousId} -> ${newest}`);
        }
        currentId = newest;
        nextRefreshAt = now() + REFRESH_AFTER_SUCCESS_MS;
        notify({
          outcome: newest === previousId ? 'unchanged' : 'switched',
          modelId: newest,
          previousId,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[claude-models] Haiku lookup failed, staying on ${currentId}: ${message}`);
        nextRefreshAt = now() + RETRY_AFTER_FAILURE_MS;
        notify({ outcome: 'failed', modelId: currentId, error: message });
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  };

  /** The model to use now. Starts a background refresh when the answer is stale. */
  const getModelId = (): string => {
    if (now() >= nextRefreshAt) {
      void refresh();
    }
    return currentId;
  };

  return { getModelId, refresh };
};

type InitOptions = Omit<ResolverOptions, 'apiKey'> & {
  /** How long startup waits for the first lookup, defaulting to 5s. */
  deadlineMs?: number;
  /** Pins this model id and skips every lookup (the HAIKU_MODEL_ID kill switch). */
  modelOverride?: string;
};

let resolver: ReturnType<typeof createHaikuModelResolver> | null = null;

/**
 * Start resolving the newest Haiku at startup. Waits at most INIT_DEADLINE_MS,
 * so a slow Models API delays the server's start by at most that long; a lookup
 * still running then finishes in the background. Never throws.
 */
export const initClaudeModels = async (
  apiKey: string,
  options: InitOptions = {},
): Promise<void> => {
  const { deadlineMs = INIT_DEADLINE_MS, modelOverride, ...resolverOptions } = options;
  if (modelOverride) {
    console.log(`[claude-models] HAIKU_MODEL_ID pins ${modelOverride}; lookups are off`);
    resolver = { getModelId: () => modelOverride, refresh: async () => {} };
    return;
  }
  resolver = createHaikuModelResolver({ apiKey, ...resolverOptions });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, deadlineMs);
    timer.unref?.();
  });
  try {
    await Promise.race([resolver.refresh(), deadline]);
  } finally {
    clearTimeout(timer);
  }
};

/** The newest Claude Haiku the API key can use (the fallback before init). */
export const getHaikuModelId = (): string => resolver?.getModelId() ?? FALLBACK_HAIKU_MODEL_ID;

import { z } from 'zod';

/**
 * Picks the newest Claude Haiku at runtime.
 *
 * The Anthropic API has no cross-version "latest Haiku" alias (each version is
 * a fixed id such as `claude-haiku-5-5`), so the newest one is found by asking
 * the Models API and choosing the newest eligible Haiku by `created_at`. The
 * answer is cached and refreshed in the background on the first request after
 * it goes stale, so a new Haiku release reaches users without a deploy and no
 * request waits on the lookup.
 *
 * A failed lookup never fails a chat: the last good answer (or the pinned
 * fallback below) keeps serving, and the lookup is retried later.
 */

/** Used until the first lookup succeeds, and whenever lookups keep failing. */
export const FALLBACK_HAIKU_MODEL_ID = 'claude-haiku-5-5';

/** The effort level the chat route sends; a model that lacks it is skipped. */
export const REQUIRED_EFFORT_LEVEL = 'low';

const HAIKU_ID_PREFIX = 'claude-haiku-';
const MODELS_URL = 'https://api.anthropic.com/v1/models';
const ANTHROPIC_VERSION = '2023-06-01';
const PAGE_LIMIT = 1000;
const MAX_PAGES = 10;
const DEFAULT_LOOKUP_TIMEOUT_MS = 5_000;
const INIT_DEADLINE_MS = 5_000;
export const REFRESH_AFTER_SUCCESS_MS = 6 * 60 * 60 * 1000;
export const RETRY_AFTER_FAILURE_MS = 10 * 60 * 1000;

// Only the fields the picker reads; everything else on a model is ignored.
// `line`, `lifecycle` and `capabilities` are optional so an older response
// shape still parses and falls back to the id prefix.
const ModelSchema = z.object({
  id: z.string(),
  created_at: z.string(),
  line: z.string().nullable().optional(),
  lifecycle: z.string().nullable().optional(),
  capabilities: z
    .object({
      effort: z.record(z.string(), z.unknown()).optional(),
    })
    .nullable()
    .optional(),
});

const ModelsPageSchema = z.object({
  data: z.array(ModelSchema),
  has_more: z.boolean(),
  last_id: z.string().nullable().optional(),
});

export type ModelSummary = z.infer<typeof ModelSchema>;

/** A Haiku that is active and supports the effort level the route sends. */
const isEligibleHaiku = (model: ModelSummary): boolean => {
  // The API documents `line` as the family discriminator; the id prefix is the
  // fallback for a response that omits it.
  const isHaiku =
    typeof model.line === 'string' ? model.line === 'haiku' : model.id.startsWith(HAIKU_ID_PREFIX);
  if (!isHaiku) {
    return false;
  }
  if (typeof model.lifecycle === 'string' && model.lifecycle !== 'active') {
    return false;
  }
  const effortLevel = model.capabilities?.effort?.[REQUIRED_EFFORT_LEVEL];
  if (effortLevel !== undefined) {
    return (effortLevel as { supported?: unknown } | null)?.supported === true;
  }
  return true;
};

/**
 * The newest eligible Haiku, or null when there is none.
 *
 * Sorted here rather than trusting the API's list order. On a tie in
 * `created_at` the shorter id wins, so an undated alias beats its dated
 * snapshot.
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
  lookupTimeoutMs?: number;
};

/** Every model the key can see, following pagination up to MAX_PAGES. */
const listModels = async (
  apiKey: string,
  fetchFn: typeof fetch,
  lookupTimeoutMs: number,
): Promise<ModelSummary[]> => {
  const models: ModelSummary[] = [];
  let afterId: string | null = null;

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
    models.push(...parsed.data.data);
    if (!parsed.data.has_more) {
      return models;
    }
    if (!parsed.data.last_id) {
      console.warn(
        '[claude-models] Models API said has_more with no last_id; using a partial list',
      );
      return models;
    }
    afterId = parsed.data.last_id;
  }
  console.warn(
    `[claude-models] Models API listing stopped at ${MAX_PAGES} pages; using a partial list`,
  );
  return models;
};

export const createHaikuModelResolver = ({
  apiKey,
  fetchFn = fetch,
  now = Date.now,
  lookupTimeoutMs = DEFAULT_LOOKUP_TIMEOUT_MS,
}: ResolverOptions) => {
  let currentId = FALLBACK_HAIKU_MODEL_ID;
  let nextRefreshAt = 0;
  let inFlight: Promise<void> | null = null;

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
        if (newest !== currentId) {
          console.log(`[claude-models] Haiku model: ${currentId} -> ${newest}`);
        }
        currentId = newest;
        nextRefreshAt = now() + REFRESH_AFTER_SUCCESS_MS;
      } catch (error) {
        console.warn(
          `[claude-models] Haiku lookup failed, staying on ${currentId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        nextRefreshAt = now() + RETRY_AFTER_FAILURE_MS;
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

let resolver: ReturnType<typeof createHaikuModelResolver> | null = null;

/**
 * Start resolving the newest Haiku at startup. Waits at most INIT_DEADLINE_MS
 * so a slow Models API cannot hold the server past its healthcheck; a lookup
 * still running then finishes in the background. Never throws.
 */
export const initClaudeModels = async (
  apiKey: string,
  options: Omit<ResolverOptions, 'apiKey'> & { deadlineMs?: number } = {},
): Promise<void> => {
  const { deadlineMs = INIT_DEADLINE_MS, ...resolverOptions } = options;
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

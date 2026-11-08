import { z } from 'zod';

/**
 * Picks the newest Claude Haiku at runtime.
 *
 * The Anthropic API has no cross-version "latest Haiku" alias (each version is
 * a fixed id such as `claude-haiku-5-5`), so the newest one is found by asking
 * the Models API and choosing the `claude-haiku-*` entry with the latest
 * `created_at`. The answer is cached and refreshed in the background, so a new
 * Haiku release reaches users without a deploy and no request ever waits on
 * the lookup.
 *
 * A failed lookup never fails a chat: the last good answer (or the pinned
 * fallback below) keeps serving, and the lookup is retried later.
 */

/** Used until the first lookup succeeds, and whenever lookups keep failing. */
export const FALLBACK_HAIKU_MODEL_ID = 'claude-haiku-5-5';

const HAIKU_ID_PREFIX = 'claude-haiku-';
const MODELS_URL = 'https://api.anthropic.com/v1/models';
const ANTHROPIC_VERSION = '2023-06-01';
const PAGE_LIMIT = 1000;
const MAX_PAGES = 10;
const LOOKUP_TIMEOUT_MS = 5_000;
const REFRESH_AFTER_SUCCESS_MS = 6 * 60 * 60 * 1000;
const RETRY_AFTER_FAILURE_MS = 10 * 60 * 1000;

const ModelsPageSchema = z.object({
  data: z.array(z.object({ id: z.string(), created_at: z.string() })),
  has_more: z.boolean(),
  last_id: z.string().nullable().optional(),
});

export type ModelSummary = { id: string; created_at: string };

/**
 * The newest `claude-haiku-*` model, or null when there is none.
 *
 * Sorted here rather than trusting the API's list order. On a tie in
 * `created_at` the shorter id wins, so an undated alias beats its dated
 * snapshot.
 */
export const pickNewestHaiku = (models: readonly ModelSummary[]): string | null => {
  const candidates = models
    .filter((model) => model.id.startsWith(HAIKU_ID_PREFIX))
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
};

/** Every model the key can see, following pagination. */
const listModels = async (apiKey: string, fetchFn: typeof fetch): Promise<ModelSummary[]> => {
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
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`Models API returned HTTP ${response.status}`);
    }

    const parsed = ModelsPageSchema.parse(await response.json());
    models.push(...parsed.data);
    if (!parsed.has_more || !parsed.last_id) {
      return models;
    }
    afterId = parsed.last_id;
  }
  return models;
};

export const createHaikuModelResolver = ({
  apiKey,
  fetchFn = fetch,
  now = Date.now,
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
        const newest = pickNewestHaiku(await listModels(apiKey, fetchFn));
        if (!newest) {
          throw new Error('Models API listed no claude-haiku-* model');
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

/** Resolve the newest Haiku once at startup, before the server takes traffic. */
export const initClaudeModels = async (apiKey: string): Promise<void> => {
  resolver = createHaikuModelResolver({ apiKey });
  await resolver.refresh();
};

/** The newest Claude Haiku the API key can use (the fallback before init). */
export const getHaikuModelId = (): string => resolver?.getModelId() ?? FALLBACK_HAIKU_MODEL_ID;

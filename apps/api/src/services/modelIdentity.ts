import { z } from 'zod';
import { ANTHROPIC_VERSION, MODELS_URL } from '@/services/claudeModels.js';

/**
 * What a Claude model id is called, for a user who asks which model they are
 * talking to.
 *
 * Chat runs on whichever Haiku services/claudeModels.ts resolved, so the id
 * changes without a deploy, and a model's own belief about its version comes
 * from training data and is often wrong. The Anthropic Models API is the
 * source of truth: a model entry carries `display_name`, such as
 * 'Claude Haiku 5.5'.
 */

/** Every id this service sees is a Claude model (HAIKU_MODEL_ID is validated to be one). */
const MAKER = 'Anthropic';

export interface ModelIdentity {
  /** Display name without the maker, e.g. 'Claude Haiku 5.5'. */
  name: string;
  /** Company that makes the model, e.g. 'Anthropic'. */
  maker: string;
  /**
   * True when the name came from the Models API. False when the lookup failed
   * and the name is only what the id spells out, which may be wrong or lack the
   * version.
   */
  isVerified: boolean;
}

export const LOOKUP_TIMEOUT_MS = 5_000;

// A failed lookup is reused for a short window, so an Anthropic outage costs
// one timeout a minute rather than one per question. A verified name is kept
// for good: a model id always has the same display name.
export const FAILURE_REUSE_MS = 60 * 1000;

// The looked-up name is third-party text that lands in the model's context.
// This checks its shape only (a short run of letters, digits and the
// punctuation product names use), which keeps out markup, line breaks and long
// text. It cannot tell a product name from other short plain words.
const MAX_NAME_LENGTH = 80;
const MAX_NAME_WORDS = 6;
const PLAIN_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 .()+-]*$/;

const isPlainName = (text: string): boolean =>
  text.length <= MAX_NAME_LENGTH &&
  PLAIN_NAME_PATTERN.test(text) &&
  text.split(/ +/).length <= MAX_NAME_WORDS;

const ModelEntrySchema = z.object({ id: z.string(), display_name: z.string() });

const DATE_SUFFIX_PATTERN = /-\d{8}$/;
const NUMBER_PATTERN = /^\d+$/;
const VERSION_PATTERN = /^\d+(\.\d+)*$/;

const capitalizeWord = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

/**
 * Best-effort identity from the id alone, used when the lookup fails.
 * 'claude-haiku-5-5' gives 'Claude Haiku 5.5', and a dated id such as
 * 'claude-haiku-4-5-20251001' drops its snapshot date.
 */
export const deriveModelIdentity = (modelId: string): ModelIdentity => {
  const words: string[] = [];
  for (const part of modelId.replace(DATE_SUFFIX_PATTERN, '').split('-')) {
    if (part === '') {
      continue;
    }
    const previous = words.at(-1);
    if (NUMBER_PATTERN.test(part) && previous !== undefined && VERSION_PATTERN.test(previous)) {
      // A run of numbers is one version: '5' then '5' is '5.5'.
      words[words.length - 1] = `${previous}.${part}`;
    } else {
      words.push(capitalizeWord(part));
    }
  }
  return { name: words.join(' ') || modelId, maker: MAKER, isVerified: false };
};

const lookUpDisplayName = async (
  modelId: string,
  apiKey: string,
  fetchFn: typeof fetch,
): Promise<string> => {
  const response = await fetchFn(`${MODELS_URL}/${encodeURIComponent(modelId)}`, {
    headers: { 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION },
    signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Models API returned HTTP ${response.status}`);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error('Models API response was not valid JSON');
  }
  const entry = ModelEntrySchema.safeParse(body);
  if (!entry.success) {
    throw new Error('Models API response had no id and display_name');
  }
  if (entry.data.id !== modelId) {
    throw new Error(`Models API returned ${entry.data.id} for ${modelId}`);
  }
  if (!isPlainName(entry.data.display_name)) {
    throw new Error(`unexpected display name for ${modelId}`);
  }
  return entry.data.display_name;
};

interface CacheEntry {
  identity: Promise<ModelIdentity>;
  expiresAt: number;
}

type ResolverOptions = {
  apiKey: string;
  fetchFn?: typeof fetch;
  now?: () => number;
};

export const createModelIdentityResolver = ({
  apiKey,
  fetchFn = fetch,
  now = Date.now,
}: ResolverOptions) => {
  // Keyed by model id. The ids are the few the Haiku resolver has returned, so
  // the map stays small.
  const cache = new Map<string, CacheEntry>();

  /** Never rejects: a failed lookup logs and resolves to the id-derived name. */
  const lookUpOrDerive = async (modelId: string): Promise<ModelIdentity> => {
    try {
      const name = await lookUpDisplayName(modelId, apiKey, fetchFn);
      return { name, maker: MAKER, isVerified: true };
    } catch (error) {
      console.warn(
        `[model-identity] Lookup failed for ${modelId}, using the name derived from its id: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return deriveModelIdentity(modelId);
    }
  };

  /**
   * The current name of `modelId`. The promise is cached rather than its
   * value, so concurrent questions share one lookup.
   */
  const resolve = (modelId: string): Promise<ModelIdentity> => {
    const cached = cache.get(modelId);
    if (cached && cached.expiresAt > now()) {
      return cached.identity;
    }

    // Open-ended while the lookup runs, so a second question joins it.
    const entry: CacheEntry = { identity: lookUpOrDerive(modelId), expiresAt: Infinity };
    cache.set(modelId, entry);
    void entry.identity.then((identity) => {
      if (!identity.isVerified) {
        entry.expiresAt = now() + FAILURE_REUSE_MS;
      }
    });
    return entry.identity;
  };

  return { resolve };
};

let resolver: ReturnType<typeof createModelIdentityResolver> | null = null;

/** Hold the API key the lookup uses. Call once at startup, beside initClaudeModels. */
export const initModelIdentity = (apiKey: string): void => {
  resolver = createModelIdentityResolver({ apiKey });
};

/** Resolve the name of `modelId`; before init, the unverified id-derived name. */
export const resolveModelIdentity = (modelId: string): Promise<ModelIdentity> =>
  resolver?.resolve(modelId) ?? Promise.resolve(deriveModelIdentity(modelId));

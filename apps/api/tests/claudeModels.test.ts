import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createHaikuModelResolver,
  FALLBACK_HAIKU_MODEL_ID,
  getHaikuModelId,
  initClaudeModels,
  pickNewestHaiku,
  RETRY_AFTER_FAILURE_MS,
} from '@/services/claudeModels.js';

const FULL_CAPABILITIES = {
  effort: { low: { supported: true } },
  thinking: { types: { disabled: { supported: true } } },
};

/** A model entry with everything the route needs, unless overridden. */
const model = (id: string, createdAt: string, overrides: Record<string, unknown> = {}) => ({
  id,
  created_at: createdAt,
  capabilities: FULL_CAPABILITIES,
  ...overrides,
});

const page = (data: Array<Record<string, unknown>>, hasMore = false) =>
  new Response(JSON.stringify({ data, has_more: hasMore, last_id: data.at(-1)?.id ?? null }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('pickNewestHaiku', () => {
  it('picks the most recently created Haiku, whatever the list order', () => {
    expect(
      pickNewestHaiku([
        model('claude-haiku-4-5-20251001', '2025-10-01T00:00:00Z'),
        model('claude-opus-5-5', '2026-10-20T00:00:00Z'),
        model('claude-haiku-5-5', '2026-10-07T00:00:00Z'),
        model('claude-3-haiku-20240307', '2024-03-07T00:00:00Z'),
      ]),
    ).toBe('claude-haiku-5-5');
  });

  it('ignores non-Haiku models even when they are newer', () => {
    expect(
      pickNewestHaiku([
        model('claude-sonnet-5-5', '2026-11-01T00:00:00Z'),
        model('claude-haiku-4-5', '2025-10-01T00:00:00Z'),
      ]),
    ).toBe('claude-haiku-4-5');
  });

  it('breaks a created_at tie by shorter id, even against alphabetical order', () => {
    // 'claude-haiku-6-z' sorts after the dated id alphabetically but is
    // shorter, so only the length rule picks it.
    expect(
      pickNewestHaiku([
        model('claude-haiku-6-20270101', '2027-01-01T00:00:00Z'),
        model('claude-haiku-6-z', '2027-01-01T00:00:00Z'),
      ]),
    ).toBe('claude-haiku-6-z');
  });

  it('returns null for an empty list, no Haiku, or unparseable dates', () => {
    expect(pickNewestHaiku([])).toBeNull();
    expect(pickNewestHaiku([model('claude-opus-5-5', '2026-01-01T00:00:00Z')])).toBeNull();
    expect(pickNewestHaiku([model('claude-haiku-5-5', 'not a date')])).toBeNull();
  });
});

describe('pickNewestHaiku eligibility (fails closed)', () => {
  const older = model('claude-haiku-5-5', '2026-10-07T00:00:00Z');

  it.each([
    ['line names another family', { line: 'sonnet' }],
    ['line is null (no line)', { line: null }],
    ['lifecycle is not active', { lifecycle: 'deprecated' }],
    ['capabilities is null', { capabilities: null }],
    ['capabilities is missing', { capabilities: undefined }],
    ['effort has no low entry', { capabilities: { ...FULL_CAPABILITIES, effort: {} } }],
    [
      'low effort is unsupported',
      { capabilities: { ...FULL_CAPABILITIES, effort: { low: { supported: false } } } },
    ],
    [
      'disabled thinking is unsupported',
      {
        capabilities: {
          ...FULL_CAPABILITIES,
          thinking: { types: { disabled: { supported: false } } },
        },
      },
    ],
    ['thinking types are missing', { capabilities: { effort: FULL_CAPABILITIES.effort } }],
  ])('skips a newer Haiku when %s', (_case, overrides) => {
    expect(
      pickNewestHaiku([model('claude-haiku-6', '2027-05-01T00:00:00Z', overrides), older]),
    ).toBe('claude-haiku-5-5');
  });

  it('accepts line "haiku" and lifecycle "active"', () => {
    expect(
      pickNewestHaiku([
        model('claude-haiku-6', '2027-05-01T00:00:00Z', { line: 'haiku', lifecycle: 'active' }),
        older,
      ]),
    ).toBe('claude-haiku-6');
  });

  it('uses the id prefix only when line is absent', () => {
    expect(pickNewestHaiku([model('claude-haiku-6', '2027-05-01T00:00:00Z'), older])).toBe(
      'claude-haiku-6',
    );
  });
});

describe('createHaikuModelResolver', () => {
  it('starts on the pinned fallback and begins a lookup on first use', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchFn = vi.fn<typeof fetch>(async () => page([]));
    const resolver = createHaikuModelResolver({ apiKey: 'k', fetchFn, now: () => 0 });

    expect(resolver.getModelId()).toBe(FALLBACK_HAIKU_MODEL_ID);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('follows pagination and sends the API key and version headers', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(page([model('claude-haiku-4-5', '2025-10-01T00:00:00Z')], true))
      .mockResolvedValueOnce(page([model('claude-haiku-6', '2027-05-01T00:00:00Z')]));
    const resolver = createHaikuModelResolver({ apiKey: 'secret', fetchFn, now: () => 0 });

    await resolver.refresh();

    expect(resolver.getModelId()).toBe('claude-haiku-6');
    expect(fetchFn).toHaveBeenCalledTimes(2);
    const [secondUrl, secondInit] = fetchFn.mock.calls[1];
    expect(String(secondUrl)).toContain('after_id=claude-haiku-4-5');
    expect(secondInit?.headers).toMatchObject({
      'x-api-key': 'secret',
      'anthropic-version': '2023-06-01',
    });
  });

  it('keeps the last good model when a later lookup fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    let clock = 0;
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(page([model('claude-haiku-6', '2027-05-01T00:00:00Z')]))
      .mockResolvedValueOnce(new Response('nope', { status: 401 }));
    const resolver = createHaikuModelResolver({ apiKey: 'k', fetchFn, now: () => clock });

    await resolver.refresh();
    clock += 7 * 60 * 60 * 1000;
    await resolver.refresh();

    expect(resolver.getModelId()).toBe('claude-haiku-6');
  });

  it('stays on the fallback when the API is unreachable or lists no eligible Haiku', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const unreachable = createHaikuModelResolver({
      apiKey: 'k',
      fetchFn: vi.fn<typeof fetch>(async () => {
        throw new TypeError('fetch failed');
      }),
      now: () => 0,
    });
    await expect(unreachable.refresh()).resolves.toBeUndefined();
    expect(unreachable.getModelId()).toBe(FALLBACK_HAIKU_MODEL_ID);

    const noHaiku = createHaikuModelResolver({
      apiKey: 'k',
      fetchFn: vi.fn<typeof fetch>(async () =>
        page([model('claude-opus-5-5', '2026-10-20T00:00:00Z')]),
      ),
      now: () => 0,
    });
    await noHaiku.refresh();
    expect(noHaiku.getModelId()).toBe(FALLBACK_HAIKU_MODEL_ID);
  });

  it('refreshes only once the cached answer is stale', async () => {
    let clock = 0;
    const fetchFn = vi.fn<typeof fetch>(async () =>
      page([model('claude-haiku-5-5', '2026-10-07T00:00:00Z')]),
    );
    const resolver = createHaikuModelResolver({ apiKey: 'k', fetchFn, now: () => clock });
    await resolver.refresh();
    expect(fetchFn).toHaveBeenCalledTimes(1);

    clock += 60 * 60 * 1000; // 1h: still fresh
    resolver.getModelId();
    expect(fetchFn).toHaveBeenCalledTimes(1);

    clock += 6 * 60 * 60 * 1000; // past the 6h window
    resolver.getModelId();
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('collapses concurrent refreshes into one lookup', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () =>
      page([model('claude-haiku-5-5', '2026-10-07T00:00:00Z')]),
    );
    const resolver = createHaikuModelResolver({ apiKey: 'k', fetchFn, now: () => 0 });
    await Promise.all([resolver.refresh(), resolver.refresh(), resolver.refresh()]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe('createHaikuModelResolver failure handling', () => {
  it('retries a failed lookup after the retry interval, not before', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    let clock = 0;
    const fetchFn = vi.fn<typeof fetch>(async () => new Response('down', { status: 503 }));
    const resolver = createHaikuModelResolver({ apiKey: 'k', fetchFn, now: () => clock });
    await resolver.refresh();
    expect(fetchFn).toHaveBeenCalledTimes(1);

    clock = RETRY_AFTER_FAILURE_MS - 1;
    resolver.getModelId();
    expect(fetchFn).toHaveBeenCalledTimes(1);

    clock = RETRY_AFTER_FAILURE_MS;
    resolver.getModelId();
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('rejects a 200 response with the wrong shape through the validator', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const resolver = createHaikuModelResolver({
      apiKey: 'k',
      fetchFn: vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ models: [] }))),
      now: () => 0,
    });
    await resolver.refresh();
    expect(resolver.getModelId()).toBe(FALLBACK_HAIKU_MODEL_ID);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('did not match the expected shape'));
  });

  it('stops paging when has_more comes with no last_id', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchFn = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            data: [model('claude-haiku-6', '2027-05-01T00:00:00Z')],
            has_more: true,
            last_id: null,
          }),
        ),
    );
    const resolver = createHaikuModelResolver({ apiKey: 'k', fetchFn, now: () => 0 });
    await resolver.refresh();

    expect(resolver.getModelId()).toBe('claude-haiku-6');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('has_more with no last_id'));
  });

  it('falls back when the lookup times out', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const hangsUntilAborted: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      });
    const resolver = createHaikuModelResolver({
      apiKey: 'k',
      fetchFn: hangsUntilAborted,
      now: () => 0,
      lookupTimeoutMs: 20,
    });
    await resolver.refresh();
    expect(resolver.getModelId()).toBe(FALLBACK_HAIKU_MODEL_ID);
  });
});

describe('initClaudeModels', () => {
  // Each test calls initClaudeModels, which replaces the module-level resolver,
  // so no test depends on another's state.

  it('serves the newest Haiku once init resolves', async () => {
    await initClaudeModels('k', {
      fetchFn: vi.fn<typeof fetch>(async () =>
        page([model('claude-haiku-6', '2027-05-01T00:00:00Z')]),
      ),
    });
    expect(getHaikuModelId()).toBe('claude-haiku-6');
  });

  it('never throws when the lookup fails, and serves the fallback', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(
      initClaudeModels('k', {
        fetchFn: vi.fn<typeof fetch>(async () => {
          throw new TypeError('fetch failed');
        }),
      }),
    ).resolves.toBeUndefined();
    expect(getHaikuModelId()).toBe(FALLBACK_HAIKU_MODEL_ID);
  });

  it('stops waiting at its deadline when the Models API hangs', async () => {
    vi.useFakeTimers();
    let settled = false;
    const init = initClaudeModels('k', {
      fetchFn: () => new Promise<Response>(() => {}),
      deadlineMs: 5_000,
    }).then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(4_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await init;
    expect(settled).toBe(true);
    expect(getHaikuModelId()).toBe(FALLBACK_HAIKU_MODEL_ID);
  });
});

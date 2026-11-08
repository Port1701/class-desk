import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createHaikuModelResolver,
  FALLBACK_HAIKU_MODEL_ID,
  getHaikuModelId,
  initClaudeModels,
  pickNewestHaiku,
  REFRESH_AFTER_SUCCESS_MS,
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
  line: id.startsWith('claude-haiku-') ? 'haiku' : id.split('-')[1],
  lifecycle: 'active',
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

  it('prefers an undated alias over its dated snapshot created at the same time', () => {
    expect(
      pickNewestHaiku([
        model('claude-haiku-6-20270101', '2027-01-01T00:00:00Z'),
        model('claude-haiku-6', '2027-01-01T00:00:00Z'),
      ]),
    ).toBe('claude-haiku-6');
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

  it('breaks a tie in time and length alphabetically, in either list order', () => {
    const a = model('claude-haiku-6-aaa', '2027-01-01T00:00:00Z');
    const b = model('claude-haiku-6-bbb', '2027-01-01T00:00:00Z');
    expect(pickNewestHaiku([a, b])).toBe('claude-haiku-6-aaa');
    expect(pickNewestHaiku([b, a])).toBe('claude-haiku-6-aaa');
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
    ['line is absent', { line: undefined }],
    ['lifecycle is not active', { lifecycle: 'deprecated' }],
    ['lifecycle is null', { lifecycle: null }],
    ['lifecycle is absent', { lifecycle: undefined }],
    ['capabilities is null', { capabilities: null }],
    ['capabilities is missing', { capabilities: undefined }],
    ['effort has no low entry', { capabilities: { ...FULL_CAPABILITIES, effort: {} } }],
    ['low effort is null', { capabilities: { ...FULL_CAPABILITIES, effort: { low: null } } }],
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
    [
      'thinking types are empty',
      { capabilities: { ...FULL_CAPABILITIES, thinking: { types: {} } } },
    ],
    ['thinking is missing', { capabilities: { effort: FULL_CAPABILITIES.effort } }],
  ])('skips a newer Haiku when %s', (_case, overrides) => {
    expect(
      pickNewestHaiku([model('claude-haiku-6', '2027-05-01T00:00:00Z', overrides), older]),
    ).toBe('claude-haiku-5-5');
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

  it('parses a response shaped like the documented Models API list', async () => {
    // Shapes follow https://platform.claude.com/docs/en/api/models/list,
    // including fields the picker ignores.
    const documented = {
      data: [
        {
          type: 'model',
          id: 'claude-opus-5-5',
          display_name: 'Claude Opus 5.5',
          created_at: '2026-10-20T00:00:00Z',
          line: 'opus',
          lifecycle: 'active',
          max_input_tokens: 1_000_000,
          max_tokens: 128_000,
          capabilities: {
            image_input: { supported: true },
            effort: {
              supported: true,
              low: { supported: true },
              medium: { supported: true },
              xhigh: null,
            },
            thinking: {
              supported: true,
              types: { adaptive: { supported: true }, disabled: { supported: false } },
            },
          },
        },
        {
          type: 'model',
          id: 'claude-haiku-5-5',
          display_name: 'Claude Haiku 5.5',
          created_at: '2026-10-07T00:00:00Z',
          line: 'haiku',
          lifecycle: 'active',
          capabilities: {
            effort: { supported: true, low: { supported: true } },
            thinking: { supported: true, types: { disabled: { supported: true } } },
          },
        },
      ],
      has_more: false,
      first_id: 'claude-opus-5-5',
      last_id: 'claude-haiku-5-5',
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const resolver = createHaikuModelResolver({
      apiKey: 'k',
      fetchFn: vi.fn<typeof fetch>(async () => new Response(JSON.stringify(documented))),
      now: () => 0,
    });

    await resolver.refresh();

    expect(resolver.getModelId()).toBe('claude-haiku-5-5');
    expect(warn).not.toHaveBeenCalled();
  });

  it('skips one malformed model without discarding the rest of the page', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const resolver = createHaikuModelResolver({
      apiKey: 'k',
      fetchFn: vi.fn<typeof fetch>(async () =>
        page([
          { id: 'claude-haiku-7', created_at: 12345 },
          model('claude-haiku-6', '2027-05-01T00:00:00Z'),
        ]),
      ),
      now: () => 0,
    });

    await resolver.refresh();

    expect(resolver.getModelId()).toBe('claude-haiku-6');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('skipped 1 model'));
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
      'anthropic-version': '2026-10-21',
    });
  });

  it('stops paging at the page cap and still picks from what it has', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let call = 0;
    const fetchFn = vi.fn<typeof fetch>(async () => {
      call++;
      return page(
        [model(`claude-haiku-${call}`, `2027-01-${String(call).padStart(2, '0')}T00:00:00Z`)],
        true,
      );
    });
    const resolver = createHaikuModelResolver({ apiKey: 'k', fetchFn, now: () => 0 });

    await resolver.refresh();

    expect(fetchFn).toHaveBeenCalledTimes(10);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('stopped at 10 pages'));
    expect(resolver.getModelId()).toBe('claude-haiku-10');
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

  it('refreshes exactly when the cached answer goes stale', async () => {
    let clock = 0;
    const fetchFn = vi.fn<typeof fetch>(async () =>
      page([model('claude-haiku-5-5', '2026-10-07T00:00:00Z')]),
    );
    const resolver = createHaikuModelResolver({ apiKey: 'k', fetchFn, now: () => clock });
    await resolver.refresh();
    expect(fetchFn).toHaveBeenCalledTimes(1);

    clock = REFRESH_AFTER_SUCCESS_MS - 1;
    resolver.getModelId();
    expect(fetchFn).toHaveBeenCalledTimes(1);

    clock = REFRESH_AFTER_SUCCESS_MS;
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

  it('stops waiting at the deadline it is given', async () => {
    vi.useFakeTimers();
    let settled = false;
    const init = initClaudeModels('k', {
      fetchFn: () => new Promise<Response>(() => {}),
      deadlineMs: 2_000,
    }).then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(1_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await init;
    expect(settled).toBe(true);
  });

  it('waits 5s by default', async () => {
    vi.useFakeTimers();
    let settled = false;
    const init = initClaudeModels('k', {
      fetchFn: () => new Promise<Response>(() => {}),
    }).then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(4_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await init;
    expect(settled).toBe(true);
  });

  it('serves a lookup that finishes after the deadline', async () => {
    vi.useFakeTimers();
    let respond: (response: Response) => void = () => {};
    const init = initClaudeModels('k', {
      fetchFn: () =>
        new Promise<Response>((resolve) => {
          respond = resolve;
        }),
      deadlineMs: 1_000,
    });

    await vi.advanceTimersByTimeAsync(1_000);
    await init;
    expect(getHaikuModelId()).toBe(FALLBACK_HAIKU_MODEL_ID);

    respond(page([model('claude-haiku-6', '2027-05-01T00:00:00Z')]));
    await vi.advanceTimersByTimeAsync(0);
    expect(getHaikuModelId()).toBe('claude-haiku-6');
  });
});

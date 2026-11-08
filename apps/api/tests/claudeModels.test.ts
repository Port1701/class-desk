import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createHaikuModelResolver,
  FALLBACK_HAIKU_MODEL_ID,
  pickNewestHaiku,
} from '@/services/claudeModels.js';

const page = (data: Array<{ id: string; created_at: string }>, hasMore = false) =>
  new Response(JSON.stringify({ data, has_more: hasMore, last_id: data.at(-1)?.id ?? null }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('pickNewestHaiku', () => {
  it('picks the most recently created Haiku, whatever the list order', () => {
    expect(
      pickNewestHaiku([
        { id: 'claude-haiku-4-5-20251001', created_at: '2025-10-01T00:00:00Z' },
        { id: 'claude-opus-5-5', created_at: '2026-10-20T00:00:00Z' },
        { id: 'claude-haiku-5-5', created_at: '2026-10-07T00:00:00Z' },
        { id: 'claude-3-haiku-20240307', created_at: '2024-03-07T00:00:00Z' },
      ]),
    ).toBe('claude-haiku-5-5');
  });

  it('ignores non-Haiku models even when they are newer', () => {
    expect(
      pickNewestHaiku([
        { id: 'claude-sonnet-5-5', created_at: '2026-11-01T00:00:00Z' },
        { id: 'claude-haiku-4-5', created_at: '2025-10-01T00:00:00Z' },
      ]),
    ).toBe('claude-haiku-4-5');
  });

  it('prefers the undated alias over a dated snapshot created at the same time', () => {
    expect(
      pickNewestHaiku([
        { id: 'claude-haiku-6-20270101', created_at: '2027-01-01T00:00:00Z' },
        { id: 'claude-haiku-6', created_at: '2027-01-01T00:00:00Z' },
      ]),
    ).toBe('claude-haiku-6');
  });

  it('returns null for an empty list, no Haiku, or unparseable dates', () => {
    expect(pickNewestHaiku([])).toBeNull();
    expect(
      pickNewestHaiku([{ id: 'claude-opus-5-5', created_at: '2026-01-01T00:00:00Z' }]),
    ).toBeNull();
    expect(pickNewestHaiku([{ id: 'claude-haiku-5-5', created_at: 'not a date' }])).toBeNull();
  });
});

describe('createHaikuModelResolver', () => {
  it('starts on the pinned fallback before any lookup', () => {
    const fetchFn = vi.fn<typeof fetch>(async () => page([]));
    const resolver = createHaikuModelResolver({ apiKey: 'k', fetchFn, now: () => 0 });
    // getModelId kicks off a background refresh but answers immediately.
    expect(resolver.getModelId()).toBe(FALLBACK_HAIKU_MODEL_ID);
  });

  it('follows pagination and sends the API key and version headers', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        page([{ id: 'claude-haiku-4-5', created_at: '2025-10-01T00:00:00Z' }], true),
      )
      .mockResolvedValueOnce(page([{ id: 'claude-haiku-6', created_at: '2027-05-01T00:00:00Z' }]));
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
      .mockResolvedValueOnce(page([{ id: 'claude-haiku-6', created_at: '2027-05-01T00:00:00Z' }]))
      .mockResolvedValueOnce(new Response('nope', { status: 401 }));
    const resolver = createHaikuModelResolver({ apiKey: 'k', fetchFn, now: () => clock });

    await resolver.refresh();
    clock += 7 * 60 * 60 * 1000;
    await resolver.refresh();

    expect(resolver.getModelId()).toBe('claude-haiku-6');
  });

  it('stays on the fallback when the API is unreachable or lists no Haiku', async () => {
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
        page([{ id: 'claude-opus-5-5', created_at: '2026-10-20T00:00:00Z' }]),
      ),
      now: () => 0,
    });
    await noHaiku.refresh();
    expect(noHaiku.getModelId()).toBe(FALLBACK_HAIKU_MODEL_ID);
  });

  it('refreshes only once the cached answer is stale', async () => {
    let clock = 0;
    const fetchFn = vi.fn<typeof fetch>(async () =>
      page([{ id: 'claude-haiku-5-5', created_at: '2026-10-07T00:00:00Z' }]),
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
      page([{ id: 'claude-haiku-5-5', created_at: '2026-10-07T00:00:00Z' }]),
    );
    const resolver = createHaikuModelResolver({ apiKey: 'k', fetchFn, now: () => 0 });
    await Promise.all([resolver.refresh(), resolver.refresh(), resolver.refresh()]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

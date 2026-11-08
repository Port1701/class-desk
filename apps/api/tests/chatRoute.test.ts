/**
 * Pins what the chat route sends to the model: the resolved Haiku id, the
 * effort level, the output ceilings, disabled thinking on suggestions, and no
 * sampling parameters. None of these has a compile-time signal, and a wrong
 * one only shows up as a failed or slower request against the live API.
 */

import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

type CallOptions = Record<string, unknown> & {
  model: unknown;
  providerOptions?: { anthropic?: Record<string, unknown> };
};

const streamTextCalls: CallOptions[] = [];
const generateObjectCalls: CallOptions[] = [];

vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: Object.assign((modelId: string) => ({ modelId }), {
    tools: { webSearch_20250305: () => ({ type: 'web-search-stub' }) },
  }),
}));

vi.mock('ai', () => ({
  stepCountIs: () => 5,
  tool: (definition: unknown) => definition,
  streamText: (options: CallOptions) => {
    streamTextCalls.push(options);
    return {
      fullStream: (async function* () {
        yield { type: 'text-delta', text: 'An answer.' };
      })(),
    };
  },
  generateObject: async (options: CallOptions) => {
    generateObjectCalls.push(options);
    return { object: { suggestions: ['A follow-up?'] } };
  },
}));

vi.mock('@langfuse/tracing', () => ({
  startActiveObservation: async (_name: string, fn: (span: { update: () => void }) => unknown) =>
    fn({ update: () => {} }),
  propagateAttributes: async (_attrs: unknown, fn: () => unknown) => fn(),
}));

vi.mock('@/services/claudeModels.js', () => ({
  getHaikuModelId: () => 'claude-haiku-test-id',
  ROUTE_EFFORT_LEVEL: 'low',
  SUGGESTIONS_THINKING: { type: 'disabled' },
}));

vi.mock('@/services/langfuse.js', () => ({
  getSystemPrompt: async () => ({ text: 'system' }),
  getSuggestionsPrompt: async () => ({ text: 'suggestions' }),
}));

vi.mock('@/services/embeddings.js', () => ({
  isEmbeddingsAvailable: () => false,
  generateEmbedding: async () => null,
}));
vi.mock('@/services/fetchUrl.js', () => ({ fetchUrl: async () => ({}) }));
vi.mock('@/services/formFiller.js', () => ({
  fillMondayForm1: async () => ({}),
  fillMondayForm2: async () => ({}),
}));
vi.mock('@/services/supabase.js', () => ({ getSupabaseClient: () => ({}) }));

let chatRouter: express.Router;

beforeAll(async () => {
  ({ default: chatRouter } = await import('@/routes/chat.js'));
});

afterEach(() => {
  streamTextCalls.length = 0;
  generateObjectCalls.length = 0;
});

const postChat = async (): Promise<string> => {
  const app = express();
  app.use(express.json());
  app.use('/chat', chatRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  try {
    const { port } = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], sessionId: 'test' }),
    });
    return await response.text();
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
};

describe('POST /chat model options', () => {
  it('runs chat on the resolved Haiku at low effort with an output ceiling', async () => {
    const body = await postChat();

    expect(body).toContain('An answer.');
    expect(streamTextCalls).toHaveLength(1);
    const [chat] = streamTextCalls;
    expect(chat.model).toEqual({ modelId: 'claude-haiku-test-id' });
    expect(chat.providerOptions?.anthropic).toEqual({ effort: 'low' });
    expect(chat.maxOutputTokens).toBe(16_000);
    expect(chat).not.toHaveProperty('temperature');
    expect(chat).not.toHaveProperty('topP');
    expect(chat).not.toHaveProperty('topK');
  });

  it('runs suggestions on the resolved Haiku with thinking off and no sampling parameters', async () => {
    const body = await postChat();

    expect(body).toContain('A follow-up?');
    expect(generateObjectCalls).toHaveLength(1);
    const [suggestions] = generateObjectCalls;
    expect(suggestions.model).toEqual({ modelId: 'claude-haiku-test-id' });
    expect(suggestions.providerOptions?.anthropic).toEqual({
      effort: 'low',
      thinking: { type: 'disabled' },
    });
    expect(suggestions.maxOutputTokens).toBe(2_000);
    expect(suggestions).not.toHaveProperty('temperature');
    expect(suggestions).not.toHaveProperty('topP');
    expect(suggestions).not.toHaveProperty('topK');
  });
});

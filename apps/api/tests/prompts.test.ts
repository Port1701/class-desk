import { describe, expect, it } from 'vitest';
import { FALLBACK_SYSTEM_PROMPT } from '@/prompts/system.js';

describe('FALLBACK_SYSTEM_PROMPT', () => {
  it('sends model-identity questions to the lookup tool and names no model itself', () => {
    // Tripwire: a model name written here goes stale the day the newest Haiku
    // changes, with nothing to flag it. The name comes from get_model_info at
    // question time, so the prompt must not mention any model or maker at all.
    // This covers the code fallback only: production serves the Langfuse prompt
    // `classdesk-system`, which has to be checked in Langfuse.
    expect(FALLBACK_SYSTEM_PROMPT).toContain('get_model_info');
    expect(FALLBACK_SYSTEM_PROMPT).not.toMatch(/claude|haiku|sonnet|opus|anthropic/i);
  });
});

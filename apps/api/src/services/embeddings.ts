import { createOpenAI } from '@ai-sdk/openai';
import { embed } from 'ai';
import { getEnvironment } from '@/config/environment.js';

const MAX_EMBED_CHARS = 30_000;

let embeddingsAvailable = false;
let openaiProvider: ReturnType<typeof createOpenAI> | null = null;

export const initEmbeddings = async () => {
  try {
    const env = getEnvironment();

    if (!env.OPENAI_API_KEY) {
      console.warn('⚠️  OPENAI_API_KEY not set — embeddings disabled');
      return;
    }

    openaiProvider = createOpenAI({ apiKey: env.OPENAI_API_KEY });

    // Test embedding call to verify connectivity
    await embed({
      model: openaiProvider.embedding('text-embedding-3-small'),
      value: 'test',
      maxRetries: 1,
    });

    console.log('✅ Embeddings service connected (text-embedding-3-small)');
    embeddingsAvailable = true;
  } catch (error) {
    console.warn(
      `⚠️  Embeddings initialization failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    embeddingsAvailable = false;
  }
};

export const generateEmbedding = async (text: string): Promise<number[] | null> => {
  if (!openaiProvider || !text) {
    return null;
  }

  try {
    const truncated = text.length > MAX_EMBED_CHARS ? text.slice(0, MAX_EMBED_CHARS) : text;

    const result = await embed({
      model: openaiProvider.embedding('text-embedding-3-small'),
      value: truncated,
      maxRetries: 2,
    });

    return result.embedding;
  } catch (error) {
    console.error(
      `[embeddings] Failed to generate embedding: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
};

export const isEmbeddingsAvailable = () => embeddingsAvailable;

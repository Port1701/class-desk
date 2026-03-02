import Langfuse from 'langfuse';
import { getEnvironment } from '@/config/environment.js';
import { FALLBACK_SUGGESTIONS_PROMPT } from '@/prompts/suggestions.js';
import { FALLBACK_SYSTEM_PROMPT } from '@/prompts/system.js';

let langfuseClient: Langfuse | null = null;
let langfuseAvailable = false;

export const initLangfuse = async () => {
  try {
    const env = getEnvironment();

    if (!env.LANGFUSE_PUBLIC_KEY || !env.LANGFUSE_SECRET_KEY) {
      console.warn('⚠️  Langfuse keys not set — prompt management and tracing disabled');
      return;
    }

    langfuseClient = new Langfuse({
      publicKey: env.LANGFUSE_PUBLIC_KEY,
      secretKey: env.LANGFUSE_SECRET_KEY,
      baseUrl: env.LANGFUSE_BASE_URL ?? 'https://cloud.langfuse.com',
    });

    console.log('✅ Langfuse connected');
    langfuseAvailable = true;
  } catch (error) {
    console.warn(
      `⚠️  Langfuse initialization failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    langfuseAvailable = false;
  }
};

export const getLangfuse = (): Langfuse | null => langfuseClient;
export const isLangfuseAvailable = () => langfuseAvailable;

const applyVariables = (text: string, variables: Record<string, string>): string =>
  Object.entries(variables).reduce((t, [key, value]) => t.replaceAll(`{{${key}}}`, value), text);

export const getSystemPrompt = async (
  variables: Record<string, string> = {},
): Promise<{
  text: string;
  prompt: object | null;
}> => {
  if (!langfuseClient) {
    return { text: applyVariables(FALLBACK_SYSTEM_PROMPT, variables), prompt: null };
  }

  try {
    const promptObj = await langfuseClient.getPrompt('classdesk-system', undefined, {
      label: 'latest',
    });
    const text = promptObj.compile(variables);
    return { text: text as string, prompt: promptObj };
  } catch (error) {
    console.warn(
      `[langfuse] Using fallback system prompt (prompt 'classdesk-system' not found): ${error instanceof Error ? error.message : String(error)}`,
    );
    return { text: applyVariables(FALLBACK_SYSTEM_PROMPT, variables), prompt: null };
  }
};

export const getSuggestionsPrompt = async (): Promise<{
  text: string;
  prompt: object | null;
}> => {
  if (!langfuseClient) {
    console.warn(
      "[langfuse] Langfuse not available — using fallback suggestions prompt. Create 'classdesk-suggestions' prompt on Langfuse for production use.",
    );
    return { text: FALLBACK_SUGGESTIONS_PROMPT, prompt: null };
  }

  try {
    const promptObj = await langfuseClient.getPrompt('classdesk-suggestions', undefined, {
      label: 'latest',
    });
    const text = promptObj.compile({});
    return { text: text as string, prompt: promptObj };
  } catch (_error) {
    console.warn(
      `[langfuse] Prompt 'classdesk-suggestions' not found on Langfuse, using fallback. Create it at: https://cloud.langfuse.com/projects/*/prompts`,
    );
    return { text: FALLBACK_SUGGESTIONS_PROMPT, prompt: null };
  }
};

export const closeLangfuse = async () => {
  if (!langfuseClient) return;

  try {
    await Promise.race([
      langfuseClient.shutdownAsync(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Langfuse shutdown timeout')), 5000),
      ),
    ]);
  } catch (error) {
    console.warn(
      `[langfuse] Shutdown error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Tests live in tests/, outside tsconfig's src/ include, so the Railway build
// (which installs apps/api alone, without the root's vitest) never compiles them.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    name: 'api',
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});

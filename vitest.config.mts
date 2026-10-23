import { defineConfig } from 'vitest/config';

// One project per unit, so each keeps its own path aliases (apps/api's `@/`
// must not leak into apps/web, which defines its own).
export default defineConfig({
  test: {
    projects: [
      { test: { name: 'iac', include: ['.railway/**/*.test.ts'] } },
      'apps/api',
    ],
  },
});

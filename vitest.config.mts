import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  oxc: { jsx: { runtime: 'automatic', importSource: 'react' } },
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    env: {
      NODE_ENV: 'test',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['lib/**', 'app/api/**/route.ts', 'components/*.tsx'],
      exclude: ['lib/types.ts', '**/*.d.ts'],
      thresholds: {
        // Piso global — não deixar a cobertura cair.
        statements: 17,
        branches: 18,
        functions: 14,
        lines: 34,
        // Módulos críticos (arquivo único): metas por arquivo.
        'app/api/admin/settings/ai/route.ts': { statements: 75, branches: 60, lines: 85 },
        'app/api/agent/generate/route.ts': { statements: 90, branches: 65, lines: 95 },
        'app/api/projects/route.ts': { statements: 75, branches: 30, lines: 90 },
        'app/api/sound-effects/route.ts': { statements: 90, branches: 75, lines: 90 },
        'lib/ai-credentials/**': { statements: 70, branches: 65, lines: 75 },
        'lib/ai-provider-router.ts': { statements: 90, branches: 80, lines: 90 },
        'lib/read-json.ts': { statements: 70, branches: 60, lines: 70 },
        'lib/secret-vault.ts': { statements: 70, branches: 55, lines: 80 },
      },
    },
  },
});

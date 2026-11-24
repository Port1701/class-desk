import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Vitest runs src/ through its own transform, which resolves `@/` aliases,
// tolerates missing `.js` extensions and papers over CommonJS default-import
// interop. Production runs `tsc && tsc-alias` output under Node's own ESM
// loader, where all three behave differently. This builds that output and
// imports every module in a plain Node process, so a break in any of them
// fails here instead of on the first deploy.

const apiRoot = fileURLToPath(new URL('..', import.meta.url));
const bin = (name: string) => join(apiRoot, 'node_modules', '.bin', name);

// The build must sit under apps/api so bare imports (express, ioredis, ...)
// resolve through apps/api/node_modules the way they do in dist/.
const cacheRoot = join(apiRoot, 'node_modules', '.cache');
const RESULT_MARKER = 'COMPILED_OUTPUT_IMPORT_FAILURES=';
let outDir = '';

const listModules = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return listModules(path);
    }
    return entry.name.endsWith('.js') ? [path] : [];
  });

beforeAll(() => {
  mkdirSync(cacheRoot, { recursive: true });
  outDir = mkdtempSync(join(cacheRoot, 'compiled-output-'));
  execFileSync(bin('tsc'), ['-p', 'tsconfig.json', '--outDir', outDir], { cwd: apiRoot });
  execFileSync(bin('tsc-alias'), ['-p', 'tsconfig.json', '--outDir', outDir], { cwd: apiRoot });
}, 120_000);

afterAll(() => {
  // Remove only the directory this run created, and only inside the cache root.
  const resolved = resolve(outDir);
  if (outDir && resolved.startsWith(cacheRoot + sep) && resolved.includes('compiled-output-')) {
    rmSync(resolved, { recursive: true, force: true });
  }
});

describe('compiled API output', () => {
  it('leaves no unrewritten @/ import in the emitted JavaScript', () => {
    const modules = listModules(join(outDir, 'src'));
    expect(modules.length).toBeGreaterThan(10);
    const offenders = modules.filter((path) => /from ['"]@\//.test(readFileSync(path, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('imports every module under plain Node ESM', () => {
    // index.js starts the server, so it is the one module left out.
    const modules = listModules(join(outDir, 'src'))
      .filter((path) => relative(join(outDir, 'src'), path) !== 'index.js')
      .map((path) => pathToFileURL(path).href);
    expect(modules.length).toBeGreaterThan(10);

    // Each failure is reported as "<module>: <error>", one per line, so a red
    // run names the module instead of dumping the whole command.
    const script = [
      `const failures = [];`,
      `for (const url of ${JSON.stringify(modules)}) {`,
      `  try { await import(url); } catch (error) { failures.push(url.split('/src/')[1] + ': ' + (error?.message ?? error)); }`,
      `}`,
      `process.stdout.write('\\n${RESULT_MARKER}' + JSON.stringify(failures) + '\\n');`,
    ].join('\n');
    // Some modules validate the environment when imported and exit when a
    // required variable is missing, so the child gets placeholder values for
    // those and nothing else: it never sees this process's real secrets.
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: outDir,
      env: {
        PATH: process.env.PATH ?? '',
        HOME: process.env.HOME ?? '',
        SUPABASE_URL: 'https://placeholder.invalid',
        SUPABASE_SECRET_KEY: 'placeholder',
        ANTHROPIC_API_KEY: 'placeholder',
      },
      encoding: 'utf8',
      timeout: 60_000,
    });
    // Modules log on load (dotenv, startup notices), so read only the marked line.
    const resultLine = output.split('\n').find((line) => line.startsWith(RESULT_MARKER));
    expect(resultLine).toBeDefined();
    expect(JSON.parse(resultLine?.slice(RESULT_MARKER.length) ?? 'null')).toEqual([]);
  }, 90_000);
});

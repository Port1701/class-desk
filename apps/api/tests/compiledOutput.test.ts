import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Production runs `tsc && tsc-alias` output under Node's own ESM loader, which
// no other test exercises: Vitest runs src/ through its own transform and its
// own `@/` alias. The typecheck under `nodenext` already rejects a missing
// `.js` extension or a default import of a CommonJS package typed with
// `export default`; this builds the real output and imports every module in a
// plain Node process to catch what only runtime sees: an alias tsc-alias left
// unrewritten, a dynamic import that does not resolve, a named export the
// CommonJS loader cannot detect, or a module that throws while loading.
//
// Each run builds into its own temp directory and removes it afterward. A run
// killed outright (SIGKILL, OOM) can leave one `compiled-output-*` directory in
// node_modules/.cache, which is gitignored and safe to delete.

const apiRoot = fileURLToPath(new URL('..', import.meta.url));
const bin = (name: string) => join(apiRoot, 'node_modules', '.bin', name);

// The build must sit under apps/api so bare imports (express, ioredis, ...)
// resolve through apps/api/node_modules the way they do in dist/.
const cacheRoot = join(apiRoot, 'node_modules', '.cache');
const RESULT_MARKER = 'COMPILED_OUTPUT_IMPORT_FAILURES=';
// A floor well under the real module count, so an empty or misdirected
// listing fails instead of passing with nothing imported.
const MIN_MODULES = 10;

let outDir = '';

const listModules = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return listModules(path);
    }
    return entry.name.endsWith('.js') ? [path] : [];
  });

// tsc prints its diagnostics on stdout, which execFileSync leaves out of the
// error it throws, so put them back in.
const runBuildStep = (command: string, args: string[]) => {
  try {
    execFileSync(command, args, { cwd: apiRoot, encoding: 'utf8', stdio: 'pipe' });
  } catch (error) {
    const { stdout = '', stderr = '' } = error as { stdout?: string; stderr?: string };
    throw new Error(`${command} ${args.join(' ')} failed:\n${stdout}${stderr}`);
  }
};

beforeAll(() => {
  mkdirSync(cacheRoot, { recursive: true });
  outDir = mkdtempSync(join(cacheRoot, 'compiled-output-'));
  // JavaScript only: declarations and source maps are never read here.
  runBuildStep(bin('tsc'), [
    '-p',
    'tsconfig.json',
    '--outDir',
    outDir,
    '--declaration',
    'false',
    '--declarationMap',
    'false',
    '--sourceMap',
    'false',
  ]);
  runBuildStep(bin('tsc-alias'), ['-p', 'tsconfig.json', '--outDir', outDir]);
}, 120_000);

afterAll(() => {
  // Remove only the directory this run created, and only inside the cache root.
  const resolved = resolve(outDir);
  if (outDir && resolved.startsWith(cacheRoot + sep)) {
    rmSync(resolved, { recursive: true, force: true });
  }
});

describe('compiled API output', () => {
  it('imports every module under plain Node ESM', () => {
    // index.js starts the server, so it is the one module left out.
    const modules = listModules(join(outDir, 'src'))
      .filter((path) => relative(join(outDir, 'src'), path) !== 'index.js')
      .map((path) => pathToFileURL(path).href);
    expect(modules.length).toBeGreaterThan(MIN_MODULES);

    // Each failure is reported as "<module>: <error>", so a red run names the
    // module. The child exits explicitly once the result is flushed, so a
    // handle a module opens on load cannot hold it open until the timeout.
    const script = [
      `const failures = [];`,
      `for (const url of ${JSON.stringify(modules)}) {`,
      `  try { await import(url); } catch (error) { failures.push(url.split('/src/')[1] + ': ' + (error?.message ?? error)); }`,
      `}`,
      `process.stdout.write('\\n${RESULT_MARKER}' + JSON.stringify(failures) + '\\n', () => process.exit(0));`,
    ].join('\n');
    // Some modules validate the environment when imported and exit when a
    // required variable is missing, so the child gets placeholder values for
    // the required keys in src/config/environment.ts (keep these in step with
    // that schema) and nothing else: it never sees this process's secrets.
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

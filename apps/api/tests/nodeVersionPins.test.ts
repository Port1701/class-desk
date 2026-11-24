import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The Node version is declared in several files that nothing else ties
// together, and Nixpacks fails quietly when they drift: a nixPkgs major its
// archive lacks breaks the build, and an engines range it cannot map falls back
// to an old default. .nvmrc is the source; everything else must agree with it.
// engines.node pins the major (`<major>.x`) so a platform never moves to a
// newer major on its own.

const repoFile = (path: string) =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

const nvmrc = repoFile('.nvmrc').trim();
const major = nvmrc.split('.')[0];
const nixpacks = repoFile('apps/api/nixpacks.toml');

const UNITS = ['.', 'apps/api', 'apps/web'];

describe('Node version pins', () => {
  it('reads a full version from .nvmrc', () => {
    expect(nvmrc).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it.each(UNITS)('%s/package.json engines.node pins the .nvmrc major', (unit) => {
    const { engines } = JSON.parse(repoFile(`${unit}/package.json`)) as {
      engines?: { node?: string };
    };
    expect(engines?.node).toBe(`${major}.x`);
  });

  it.each(UNITS)('%s/package-lock.json records the same engines.node', (unit) => {
    const lock = JSON.parse(repoFile(`${unit}/package-lock.json`)) as {
      packages?: Record<string, { engines?: { node?: string } }>;
    };
    expect(lock.packages?.['']?.engines?.node).toBe(`${major}.x`);
  });

  it('installs the .nvmrc major on Railway', () => {
    expect(nixpacks).toMatch(new RegExp(`^nixPkgs = \\["nodejs_${major}"\\]$`, 'm'));
  });

  it('pins the nixpkgs archive to a full commit', () => {
    // Without an explicit archive, Nixpacks picks one from its own Node map,
    // which may not contain the major above. This checks the pin's shape only:
    // whether that commit ships nodejs_<major> needs the network, so CLAUDE.md
    // (Railway section) has the manual check to run on every bump.
    expect(nixpacks).toMatch(/^nixpkgsArchive = "[0-9a-f]{40}"$/m);
  });
});

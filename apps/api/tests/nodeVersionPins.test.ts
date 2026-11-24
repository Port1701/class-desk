import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The Node version is declared in several files that nothing else ties
// together, and Nixpacks fails quietly when they drift: a nixPkgs major its
// archive lacks breaks the build, and an engines range it cannot map falls back
// to an old default. .nvmrc is the source; everything else must agree with it.

const repoFile = (path: string) =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

const nvmrc = repoFile('.nvmrc').trim();
const major = nvmrc.split('.')[0];
const nixpacks = repoFile('apps/api/nixpacks.toml');

describe('Node version pins', () => {
  it('reads a full version from .nvmrc', () => {
    expect(nvmrc).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it.each(['package.json', 'apps/api/package.json', 'apps/web/package.json'])(
    '%s engines.node floors at the .nvmrc major',
    (path) => {
      const { engines } = JSON.parse(repoFile(path)) as { engines?: { node?: string } };
      expect(engines?.node).toBe(`>=${major}`);
    },
  );

  it('installs the .nvmrc major on Railway', () => {
    expect(nixpacks).toMatch(new RegExp(`^nixPkgs = \\["nodejs_${major}"\\]$`, 'm'));
  });

  it('pins the nixpkgs archive to a full commit', () => {
    // Without an explicit archive, Nixpacks picks one from its own Node map,
    // which may not contain the major above.
    expect(nixpacks).toMatch(/^nixpkgsArchive = "[0-9a-f]{40}"$/m);
  });
});

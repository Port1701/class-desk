/**
 * Compiles `.railway/railway.ts` and pins the shape it renders: the settings
 * the former `apps/api/railway.json` carried, the Redis resource as the
 * dashboard provisions it, and every dashboard variable preserved by name.
 * `railway config plan` needs a linked Railway project, so this is the check
 * that runs on every commit without one.
 */
import {
  createRailwayContext,
  type DatabaseNode,
  type ProjectDefinition,
  project,
  type RailwayContextInput,
  type ResourceNode,
  type ServiceNode,
} from 'railway/iac';
import { describe, expect, it } from 'vitest';
import program from './railway';

const compile = async (input: RailwayContextInput): Promise<ProjectDefinition> =>
  await program(createRailwayContext({ command: 'plan', ...input }), project);

const listResources = (definition: ProjectDefinition): ResourceNode[] =>
  (definition.resources ?? []).flat();

const findService = (definition: ProjectDefinition, name: string): ServiceNode => {
  const node = listResources(definition).find((r) => r.type === 'service' && r.name === name);
  if (node?.type !== 'service') {
    throw new Error(`service ${name} not declared`);
  }
  return node;
};

const findDatabase = (definition: ProjectDefinition, name: string): DatabaseNode => {
  const node = listResources(definition).find((r) => r.type === 'database' && r.name === name);
  if (node?.type !== 'database') {
    throw new Error(`database ${name} not declared`);
  }
  return node;
};

describe('.railway/railway.ts', () => {
  it('refuses an environment it does not describe', async () => {
    await expect(compile({ environment: 'staging' })).rejects.toThrow(
      /does not describe environment "staging"/,
    );
  });

  it('refuses a context with no environment at all', async () => {
    await expect(compile({})).rejects.toThrow(/does not describe environment "\(none\)"/);
  });

  it('declares the API and Redis under the linked project name', async () => {
    const definition = await compile({ environment: 'production', projectName: 'My Fork' });
    const addresses = listResources(definition)
      .map((r) => r.address)
      .sort();
    expect(addresses).toEqual(['database.Redis', 'service.API']);
    expect(definition.name).toBe('My Fork');
    expect((await compile({ environment: 'production' })).name).toBe('ClassDesk');
  });

  it('carries the settings apps/api/railway.json used to hold', async () => {
    const api = findService(await compile({ environment: 'production' }), 'API');
    expect(api.source).toMatchObject({
      type: 'github',
      repo: 'Port1701/class-desk',
      branch: 'main',
      rootDirectory: 'apps/api',
    });
    expect(api.build).toEqual({ builder: 'NIXPACKS' });
    expect(api.deploy).toMatchObject({
      startCommand: 'node dist/src/index.js',
      healthcheckPath: '/health',
      healthcheckTimeout: 100,
      restartPolicyType: 'ON_FAILURE',
      restartPolicyMaxRetries: 10,
    });
  });

  it('preserves every dashboard variable by name and wires REDIS_URL to Redis', async () => {
    const api = findService(await compile({ environment: 'production' }), 'API');
    const variables = api.variables ?? {};
    const { REDIS_URL, ...preserved } = variables;
    expect(REDIS_URL).toEqual({
      type: 'reference',
      resource: 'database.Redis',
      output: 'REDIS_URL',
    });
    for (const required of ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'ANTHROPIC_API_KEY']) {
      expect(preserved).toHaveProperty(required);
    }
    expect(Object.values(preserved).every((v) => v.type === 'preserve')).toBe(true);
  });

  it('models Redis as the database resource the dashboard provisions', async () => {
    const redis = findDatabase(await compile({ environment: 'production' }), 'Redis');
    expect(redis).toMatchObject({
      engine: 'redis',
      image: 'redis:8.2.1',
      output: 'REDIS_URL',
      defaultMountPath: '/data',
    });
  });
});

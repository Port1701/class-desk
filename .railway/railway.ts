/**
 * Railway infrastructure as code for this project.
 *
 * One file describes every resource in a Railway environment: `railway config
 * plan` diffs it against the linked environment and `railway config apply`
 * lands the diff. It replaces the deprecated `railway.json` config-as-code,
 * which Railway stops reading on 2026-12-01, and a service cannot be owned by
 * both systems at once, so never add a `railway.json` back.
 *
 * "Omit means delete": a service, custom domain, or variable that exists in
 * Railway but is absent here is DESTROYED on apply. So every resource the
 * project holds is declared, and every variable whose VALUE is set in the
 * dashboard is listed by name and `preserve()`d; the value never enters the
 * repo. A variable added in the dashboard must be added to `API_VARIABLES`,
 * or the next plan reports `Delete variable API.<NAME>`. A listed name with
 * no value in Railway plans nothing, so optional variables cost nothing.
 *
 * Template users: point REPO at your fork, and add an entry to
 * BRANCH_BY_ENVIRONMENT for every Railway environment you create. Planning an
 * environment this file does not declare is refused rather than silently
 * rendered from another environment's branch.
 */
import { database, defineRailway, github, preserve, project, service } from 'railway/iac';

/** The GitHub repository Railway builds from. Point this at your fork. */
const REPO = 'Port1701/class-desk';

/** Railway environments this file describes, and the branch each one deploys. */
const ENVIRONMENTS = ['production'] as const;
type Environment = (typeof ENVIRONMENTS)[number];
const BRANCH_BY_ENVIRONMENT: Record<Environment, string> = { production: 'main' };

const isKnownEnvironment = (name: string | undefined): name is Environment =>
  (ENVIRONMENTS as readonly string[]).includes(name ?? '');

const preserveAll = (names: readonly string[]) =>
  Object.fromEntries(names.map((name) => [name, preserve()]));

/**
 * Variables whose values are set in the Railway dashboard (README → Backend
 * (Railway); apps/api/src/config/environment.ts validates the required ones at
 * boot). Names only, alphabetized; the values stay in Railway. REDIS_URL is
 * not listed because it is a reference to the Redis service below.
 */
const API_VARIABLES = [
  'ADMIN_EMAILS',
  'ANTHROPIC_API_KEY',
  'CORS_ORIGINS',
  'INTERNAL_API_KEY',
  'LANGFUSE_BASE_URL',
  'LANGFUSE_PUBLIC_KEY',
  'LANGFUSE_SECRET_KEY',
  'MAILGUN_API_KEY',
  'MAILGUN_DOMAIN',
  'MAILGUN_FROM',
  'NODE_ENV',
  'OPENAI_API_KEY',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_URL',
] as const;

export default defineRailway((ctx) => {
  // Fail closed: an undeclared environment must be added above before it can
  // be planned, or it would silently inherit another environment's branch.
  if (!isKnownEnvironment(ctx.environment)) {
    throw new Error(
      `.railway/railway.ts does not describe environment "${ctx.environment ?? '(none)'}"; known: ${ENVIRONMENTS.join(', ')}`,
    );
  }
  const branch = BRANCH_BY_ENVIRONMENT[ctx.environment];

  // Redis as the dashboard's "Add Redis" provisions it: Railway holds it as a
  // DATABASE resource running the official image with its volume on /data. The
  // `redis()` helper would provision railwayapp/redis on /bitnami instead, and
  // a plain `service()` with the same image plans as "create service Redis,
  // delete database Redis". The volume is deliberately NOT declared: Railway's
  // database provisioning owns it, and a `volume()` line plans the live
  // volume's region and size to whatever this file says (null when omitted).
  const redis = database('Redis', 'redis', {
    image: 'redis:8.2.1',
    output: 'REDIS_URL',
    defaultMountPath: '/data',
  });

  // Builds with Nixpacks so apps/api/nixpacks.toml keeps driving the build
  // phases; the service's root directory is apps/api, which is also where
  // .railwayignore applies.
  const api = service('API', {
    source: github(REPO, { branch, rootDirectory: 'apps/api' }),
    build: { builder: 'NIXPACKS' },
    start: 'node dist/src/index.js',
    healthcheck: '/health',
    healthcheckTimeout: 100,
    deploy: {
      // A graceful SIGTERM exits 0 (apps/api/src/index.ts), so only a crash
      // restarts.
      restartPolicyType: 'ON_FAILURE',
      restartPolicyMaxRetries: 10,
    },
    env: {
      ...preserveAll(API_VARIABLES),
      REDIS_URL: redis.env.REDIS_URL,
    },
  });

  // The linked project's own name, so a plan never proposes renaming it.
  return project(ctx.projectName ?? 'ClassDesk', {
    resources: [redis, api],
  });
});

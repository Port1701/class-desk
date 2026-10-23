/**
 * Pins request-body parsing and the error handler: the path the express,
 * body-parser, content-type and content-disposition upgrades change.
 *
 * The real app proves the parsers are mounted (its rejections come from them);
 * body parsing runs before any router, so those requests reach no route logic
 * and need no Supabase or Redis. A probe app mounting the same
 * applyBodyParsing() echoes req.body, which proves what the parsers produce.
 */

import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express, { type Express } from 'express';
import createError from 'http-errors';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

// Importing the app loads every router and service; allow for a slow machine.
const IMPORT_TIMEOUT_MS = 30_000;

const listen = async (app: Express): Promise<{ server: Server; url: string }> => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  return { server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
};

const close = async (server: Server | undefined): Promise<void> => {
  await new Promise<void>((resolve) => {
    if (!server) {
      resolve();
      return;
    }
    server.close(() => resolve());
  });
};

const post = async (url: string, body: string, contentType = 'application/json') =>
  await fetch(url, { method: 'POST', headers: { 'Content-Type': contentType }, body });

beforeAll(() => {
  // getEnvironment() validates once and caches, so stub before the first import.
  // Every key the app reads is pinned, so a local apps/api/.env cannot leak in.
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('SUPABASE_URL', 'http://127.0.0.1:54321');
  vi.stubEnv('SUPABASE_SECRET_KEY', 'test-secret');
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
  vi.stubEnv('CORS_ORIGINS', 'http://localhost:3000');
  vi.stubEnv('BYPASS_AUTH', 'false');
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe('the app mounts its body parsers', () => {
  let server: Server | undefined;
  let url: string;

  beforeAll(async () => {
    const { default: app } = await import('@/index.js');
    ({ server, url } = await listen(app));
    url = `${url}/no-such-route`;
  }, IMPORT_TIMEOUT_MS);

  afterAll(async () => {
    await close(server);
  });

  it('passes valid JSON through to routing', async () => {
    const res = await post(url, '{"ok":true}');
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: 'Not Found', path: '/no-such-route' });
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await post(url, '{"ok":');
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ status: 400 });
  });

  it('accepts a body just under the 100kb default limit', async () => {
    const res = await post(url, JSON.stringify({ pad: 'x'.repeat(90 * 1024) }));
    expect(res.status).toBe(404);
  });

  it('rejects a body over the 100kb default limit with 413', async () => {
    const res = await post(url, JSON.stringify({ pad: 'x'.repeat(110 * 1024) }));
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ status: 413 });
  });

  it('rejects an unsupported charset with 415', async () => {
    const res = await post(url, '{"ok":true}', 'application/json; charset=klingon');
    expect(res.status).toBe(415);
    expect(await res.json()).toMatchObject({ status: 415 });
  });
});

describe('applyBodyParsing and errorHandler', () => {
  let server: Server | undefined;
  let url: string;

  beforeAll(async () => {
    const { applyBodyParsing } = await import('@/middleware/bodyParsing.js');
    const { errorHandler } = await import('@/middleware/errorHandler.js');
    const app = express();
    applyBodyParsing(app);
    app.post('/echo', (req, res) => {
      res.json({ body: req.body });
    });
    app.get('/http', () => {
      throw createError(418, 'short and stout');
    });
    app.get('/zod', () => {
      z.object({ name: z.string() }).parse({});
    });
    app.get('/crash', () => {
      throw new Error('boom');
    });
    app.use(errorHandler);
    ({ server, url } = await listen(app));
  }, IMPORT_TIMEOUT_MS);

  afterAll(async () => {
    await close(server);
  });

  it('parses a JSON body', async () => {
    const res = await post(`${url}/echo`, '{"a":1,"nested":{"b":[true,null]}}');
    expect(await res.json()).toEqual({ body: { a: 1, nested: { b: [true, null] } } });
  });

  it('parses an extended urlencoded body, nesting included', async () => {
    const res = await post(`${url}/echo`, 'a=1&b=2&c[d]=3', 'application/x-www-form-urlencoded');
    expect(await res.json()).toEqual({ body: { a: '1', b: '2', c: { d: '3' } } });
  });

  it('maps an http-errors error to its status', async () => {
    const res = await fetch(`${url}/http`);
    expect(res.status).toBe(418);
    expect(await res.json()).toEqual({ error: 'short and stout', status: 418 });
  });

  it('maps a ZodError to 400 with issue details', async () => {
    const res = await fetch(`${url}/zod`);
    expect(res.status).toBe(400);
    const body: { error: string; status: number; details: { path: string }[] } = await res.json();
    expect(body).toMatchObject({ error: 'Validation error', status: 400 });
    expect(body.details).toEqual([expect.objectContaining({ path: 'name' })]);
  });

  it('maps an unknown error to 500 without a stack outside development', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await fetch(`${url}/crash`);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'boom', status: 500 });
  });
});

/**
 * Drives the real Express app over HTTP to pin request-body parsing and the
 * error handler: the path express, body-parser, content-type and
 * content-disposition upgrades change. Body parsing runs before any router,
 * so these requests reach no route logic and need no Supabase or Redis.
 */

import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import createError from 'http-errors';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  // getEnvironment() validates at import time; these satisfy its required keys.
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('SUPABASE_URL', 'http://127.0.0.1:54321');
  vi.stubEnv('SUPABASE_SECRET_KEY', 'test-secret');
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
  const { default: app } = await import('@/index.js');
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server?.close(() => resolve());
  });
  vi.unstubAllEnvs();
});

const postBody = async (body: string, contentType = 'application/json') =>
  await fetch(`${baseUrl}/no-such-route`, {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body,
  });

describe('request body parsing', () => {
  it('passes valid JSON through to routing', async () => {
    const res = await postBody('{"ok":true}');
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: 'Not Found', path: '/no-such-route' });
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await postBody('{"ok":');
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ status: 400 });
  });

  it('rejects a body over the 100kb default limit with 413', async () => {
    const res = await postBody(JSON.stringify({ pad: 'x'.repeat(110 * 1024) }));
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ status: 413 });
  });

  it('rejects an unsupported charset with 415', async () => {
    const res = await postBody('{"ok":true}', 'application/json; charset=klingon');
    expect(res.status).toBe(415);
    expect(await res.json()).toMatchObject({ status: 415 });
  });

  it('parses urlencoded bodies without error', async () => {
    const res = await postBody('a=1&b=2', 'application/x-www-form-urlencoded');
    expect(res.status).toBe(404);
  });
});

describe('errorHandler', () => {
  let probe: Server;
  let probeUrl: string;

  beforeAll(async () => {
    const { errorHandler } = await import('@/middleware/errorHandler.js');
    const app = express();
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
    probe = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => probe.once('listening', resolve));
    probeUrl = `http://127.0.0.1:${(probe.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      probe?.close(() => resolve());
    });
  });

  it('maps an http-errors error to its status', async () => {
    const res = await fetch(`${probeUrl}/http`);
    expect(res.status).toBe(418);
    expect(await res.json()).toEqual({ error: 'short and stout', status: 418 });
  });

  it('maps a ZodError to 400 with issue details', async () => {
    const res = await fetch(`${probeUrl}/zod`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({ error: 'Validation error', status: 400 });
    expect(body.details).toEqual([expect.objectContaining({ path: 'name' })]);
  });

  it('maps an unknown error to 500 without a stack outside development', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await fetch(`${probeUrl}/crash`);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'boom', status: 500 });
    spy.mockRestore();
  });
});

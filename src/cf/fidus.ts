// src/cf/fidus.ts
// Fidus staging Worker: serves the built React SPA and the /api/* backend.
import { getAssetFromKV } from '@cloudflare/kv-asset-handler';
import type { ExecutionContext } from '@cloudflare/workers-types';

// Types only; the runtime is provided by the Workers environment.
type Env = { DB: any; JWT_SECRET: string; SESSION_SECRET: string };

// Auth module is bundled by Vite into the worker environment.
import * as auth from './auth';

const ALLOWED_METHODS: Record<string, string[]> = {
  '/api/health': ['GET', 'OPTIONS'],
  '/api/auth/register': ['POST', 'OPTIONS'],
  '/api/auth/login': ['POST', 'OPTIONS'],
  '/api/auth/logout': ['POST', 'OPTIONS'],
  '/api/auth/me': ['GET', 'OPTIONS'],
  '/api/staff/invite': ['POST', 'OPTIONS'],
  '/api/staff/apply': ['POST', 'OPTIONS'],
  '/api/staff/applications': ['GET', 'OPTIONS'],
  '/api/staff/applications/approve': ['POST', 'OPTIONS'],
  '/api/staff/applications/reject': ['POST', 'OPTIONS'],
  '/api/staff/accept-invitation': ['POST', 'OPTIONS'],
  '/api/staff/login': ['POST', 'OPTIONS'],
  '/api/staff/me': ['GET', 'OPTIONS'],
  '/api/users': ['GET', 'OPTIONS'],
};

function json(body: any, status = 200, headers?: HeadersInit): Response {
  const h = new Headers(headers);
  h.set('Content-Type', 'application/json');
  h.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(body), { status, headers: h });
}

function methodNotAllowed(path: string): Response {
  return json({ success: false, message: `Method not allowed: ${path}` }, 405);
}

function notFound(path: string, isApi: boolean): Response {
  return isApi
    ? json({ success: false, message: `Not found: ${path}` }, 404)
    : new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
}

function readBodyJson(req: Request): Promise<any> {
  return req.json().catch(() => null);
}

function clientIp(headers: Headers): string | undefined {
  const forwarded = headers.get('cf-connecting-ip') || headers.get('x-forwarded-for');
  return forwarded ? forwarded.split(',')[0].trim() : undefined;
}

function normalizeApiPath(pathname: string): string {
  // collapse trailing slashes for matching but keep root /api
  let p = pathname.replace(/\/+$/, '');
  if (p === '/api') p = '/api/health';
  return p;
}

function routeKey(pathname: string): string {
  // Map actual paths to the keys used in ALLOWED_METHODS
  if (pathname === '/api/staff/invite') return '/api/staff/invite';
  if (pathname === '/api/staff/apply') return '/api/staff/apply';
  if (pathname === '/api/staff/applications') return '/api/staff/applications';
  if (pathname.startsWith('/api/staff/applications/approve')) return '/api/staff/applications/approve';
  if (pathname.startsWith('/api/staff/applications/reject')) return '/api/staff/applications/reject';
  if (pathname === '/api/staff/accept-invitation') return '/api/staff/accept-invitation';
  if (pathname === '/api/staff/login') return '/api/staff/login';
  if (pathname === '/api/staff/me') return '/api/staff/me';
  if (pathname.startsWith('/api/users')) return '/api/users';
  return pathname;
}

function bearerToken(req: Request): string | null {
  const auth = req.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  return auth.slice(7).trim() || null;
}

async function handleApi(ctx: ExecutionContext, req: Request, pathname: string, method: string, ip: string | undefined) {
  const rk = routeKey(pathname);

  // CORS preflight
  if (method === 'OPTIONS') {
    const h = new Headers();
    h.set('Access-Control-Allow-Origin', '*');
    h.set('Access-Control-Allow-Methods', ALLOWED_METHODS[rk]?.join(', ') ?? 'GET, POST, OPTIONS');
    h.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    h.set('Access-Control-Max-Age', '86400');
    return new Response(null, { status: 204, headers: h });
  }

  // Unknown route
  if (!ALLOWED_METHODS[rk]) {
    return notFound(pathname, true);
  }
  // Method check
  if (!ALLOWED_METHODS[rk].includes(method)) {
    return methodNotAllowed(pathname);
  }

  switch (pathname) {
    case '/api/health': {
      return json({
        status: 'healthy',
        system: 'Fidus Medical Center HMS',
        time: new Date().toISOString(),
        version: 'staging',
      });
    }

    case '/api/auth/register': {
      const body = await readBodyJson(req);
      const res = await auth.registerPatient(ctx, body, ip);
      return json(res.json, res.status);
    }

    case '/api/auth/login': {
      const body = await readBodyJson(req);
      const res = await auth.login(ctx, body, ip);
      return json(res.json, res.status);
    }

    case '/api/auth/logout': {
      const token = bearerToken(req);
      const me = token ? await auth.getMe(ctx, token, ip) : null;
      const actor = me && me.status === 200 ? (me.json as any)?.data : undefined;
      const res = await auth.logout(ctx, actor, ip);
      return json(res.json, res.status);
    }

    case '/api/auth/me': {
      const token = bearerToken(req);
      const res = await auth.getMe(ctx, token, ip);
      return json(res.json, res.status);
    }

    case '/api/staff/invite': {
      const token = bearerToken(req);
      const a = await auth.requireRole(ctx, token, ['Administrator'], ip);
      if (!a.ok) return json(a.json, a.status);
      const body = await readBodyJson(req);
      const res = await auth.createStaffInvitation(ctx, body, a.user, ip);
      return json(res.json, res.status);
    }

    case '/api/staff/apply': {
      const body = await readBodyJson(req);
      const res = await auth.applyStaff(ctx, body, ip);
      return json(res.json, res.status);
    }

    case '/api/staff/accept-invitation': {
      const body = await readBodyJson(req);
      const res = await auth.acceptInvitation(ctx, body, ip);
      return json(res.json, res.status);
    }

    case '/api/staff/login': {
      const body = await readBodyJson(req);
      const res = await auth.staffLogin(ctx, body, ip);
      return json(res.json, res.status);
    }

    case '/api/staff/me': {
      const token = bearerToken(req);
      const res = await auth.getMe(ctx, token, ip);
      return json(res.json, res.status);
    }

    case '/api/staff/applications': {
      const token = bearerToken(req);
      const a = await auth.requireRole(ctx, token, ['Administrator'], ip);
      if (!a.ok) return json(a.json, a.status);
      const res = await auth.listStaffApplications(ctx, a.user, ip);
      return json(res.json, res.status);
    }

    case '/api/staff/applications/approve': {
      const token = bearerToken(req);
      const a = await auth.requireRole(ctx, token, ['Administrator'], ip);
      if (!a.ok) return json(a.json, a.status);
      const body = await readBodyJson(req);
      const res = await auth.approveStaffApplication(ctx, body, a.user, ip);
      return json(res.json, res.status);
    }

    case '/api/staff/applications/reject': {
      const token = bearerToken(req);
      const a = await auth.requireRole(ctx, token, ['Administrator'], ip);
      if (!a.ok) return json(a.json, a.status);
      const body = await readBodyJson(req);
      const res = await auth.rejectStaffApplication(ctx, body, a.user, ip);
      return json(res.json, res.status);
    }

    case '/api/users': {
      const token = bearerToken(req);
      const a = await auth.requireRole(ctx, token, ['Administrator'], ip);
      if (!a.ok) return json(a.json, a.status);
      const res = await auth.listUsers(ctx, a.user, ip);
      return json(res.json, res.status);
    }

    default: {
      return notFound(pathname, true);
    }
  }
}

export default {
  async fetch(request: Request, env: any, ctx: ExecutionContext): Promise<Response> {
    // Expose env + secrets to the auth module without logging secret values.
    // The auth module reads DB from __FIDUS_ENV__ and JWT/session secrets from
    // __FIDUS_SECRETS so it does not need the caller to thread env through.
    (globalThis as any).__FIDUS_ENV__ = env;
    (globalThis as any).__FIDUS_SECRETS = {
      jwt_secret_hex: (env as any)?.JWT_SECRET ?? '',
      session_secret_hex: (env as any)?.SESSION_SECRET ?? '',
    };

    const url = new URL(request.url);
    const method = request.method;
    const pathname = url.pathname;
    const ip = clientIp(request.headers);

    // API routes: never serve the SPA for /api/*
    if (pathname.startsWith('/api/')) {
      return handleApi(ctx, request, pathname, method, ip);
    }

    // Frontend assets via Cloudflare Assets (getAssetFromKV from kv-asset-handler).
    // Uses the __STATIC_CONTENT / __STATIC_CONTENT_MANIFEST injected by Wrangler
    // when the assets binding is configured. Fallback to dist/index.html only
    // when the assets runtime is unavailable (e.g. certain preview/local modes).
    try {
      const response = await getAssetFromKV({ request, env, context: ctx }, {
        cacheControl: 'public, max-age=0, must-revalidate',
      });
      if (response) return response;
    } catch (err) {
      // If assets binding is unavailable, fall back to serving dist/index.html
      // for navigation requests and 404 otherwise.
      console.warn('[fidus] getAssetFromKV unavailable, using dist fallback:', (err as any)?.message);
    }

    // SPA fallback for frontend navigation requests only.
    // Serve index.html for the root path and any request that looks like a
    // browser navigation (HTML accept) when the assets binding did not match.
    // Always 404 for non-GET/HEAD and for requests that already look like a
    // static asset path.
    if (method !== 'GET' && method !== 'HEAD') {
      return notFound(pathname, false);
    }

    const accept = request.headers.get('Accept') || '';
    const looksLikeAsset = pathname.includes('.');
    const isNavigation =
      pathname === '/' ||
      (!looksLikeAsset && (accept.includes('text/html') || accept.includes('*/*')));

    if (isNavigation) {
      return serveIndex();
    }

    return notFound(pathname, false);
  },
};

let _indexHtml: string | null = null;

async function serveIndex(): Promise<Response> {
  if (_indexHtml) {
    return new Response(_indexHtml, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    });
  }
  try {
    const res = await fetch('./index.html', { redirect: 'follow' });
    if (res.ok) {
      _indexHtml = await res.text();
      return new Response(_indexHtml, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache',
        },
      });
    }
  } catch {}
  return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
}

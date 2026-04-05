import fp from 'fastify-plugin';
import { jwtVerify, type JWTPayload } from 'jose';
import type { FastifyInstance, FastifyRequest } from 'fastify';

export interface AuthContext {
  subject: string;
  role: 'viewer' | 'writer' | 'admin';
  projectIds: string[];
}

type ProjectScopedJwt = JWTPayload & {
  role?: 'viewer' | 'writer' | 'admin';
  projects?: string[];
};

export interface AuthPluginOptions {
  jwtSecret: string;
  jwtIssuer: string;
  jwtAudience: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext;
  }
}

/**
 * Shared JWT authentication plugin — used by api-gateway and control-api.
 *
 * Expects a Bearer token in the Authorization header.
 * Verifies signature, issuer, and audience, and exposes JWT claims to handlers.
 *
 * Routes can opt out by adding `{ config: { public: true } }` to their schema options.
 */
export const authPlugin = fp(async (app: FastifyInstance, opts: AuthPluginOptions) => {
  const JWT_KEY = new TextEncoder().encode(opts.jwtSecret);

  app.decorateRequest('auth', null);

  app.addHook('onRequest', async (request, reply) => {
    const routeConfig = (request.routeOptions as { config?: { public?: boolean } })?.config;
    if (routeConfig?.public === true) return;

    const authHeader = request.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Unauthorized', message: 'Missing Bearer token' });
    }

    try {
      const token = authHeader.slice(7);
      const { payload } = await jwtVerify(token, JWT_KEY, {
        issuer: opts.jwtIssuer,
        audience: opts.jwtAudience,
        algorithms: ['HS256'],
      });

      const claims = payload as ProjectScopedJwt;
      request.auth = {
        subject: claims.sub ?? 'unknown',
        role: claims.role ?? 'viewer',
        projectIds: Array.isArray(claims.projects)
          ? claims.projects.filter((value): value is string => typeof value === 'string')
          : [],
      };
    } catch {
      return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid or expired token' });
    }
  });
});

import fp from 'fastify-plugin';
import { jwtVerify } from 'jose';
import type { FastifyInstance } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    tenantId: string;
  }
}

export interface AuthPluginOptions {
  jwtSecret: string;
  jwtIssuer: string;
  jwtAudience: string;
}

/**
 * Shared JWT authentication plugin — used by api-gateway and control-api.
 *
 * Expects a Bearer token in the Authorization header.
 * The token payload must include `tenantId`.
 *
 * Routes can opt out by adding `{ config: { public: true } }` to their schema options.
 */
export const authPlugin = fp(async (app: FastifyInstance, opts: AuthPluginOptions) => {
  const JWT_KEY = new TextEncoder().encode(opts.jwtSecret);

  app.addHook('onRequest', async (request, reply) => {
    const routeConfig = (request.routeOptions as { config?: { public?: boolean } })?.config;
    if (routeConfig?.public === true) return;

    const authHeader = request.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Unauthorized', message: 'Missing Bearer token' });
    }

    const token = authHeader.slice(7);
    try {
      const { payload } = await jwtVerify(token, JWT_KEY, {
        issuer: opts.jwtIssuer,
        audience: opts.jwtAudience,
        algorithms: ['HS256'],
      });

      const tenantId = payload['tenantId'];
      if (typeof tenantId !== 'string' || tenantId.length === 0) {
        return reply.code(401).send({ error: 'Unauthorized', message: 'Missing tenantId in token' });
      }

      request.tenantId = tenantId;
    } catch {
      return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid or expired token' });
    }
  });
});

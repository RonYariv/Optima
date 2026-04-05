import fp from 'fastify-plugin';
import { jwtVerify } from 'jose';
import type { FastifyInstance } from 'fastify';

export interface AuthPluginOptions {
  jwtSecret: string;
  jwtIssuer: string;
  jwtAudience: string;
}

/**
 * Shared JWT authentication plugin — used by api-gateway and control-api.
 *
 * Expects a Bearer token in the Authorization header.
 * Verifies signature, issuer, and audience — no custom claims required.
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
      await jwtVerify(token, JWT_KEY, {
        issuer: opts.jwtIssuer,
        audience: opts.jwtAudience,
        algorithms: ['HS256'],
      });
    } catch {
      return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid or expired token' });
    }
  });
});

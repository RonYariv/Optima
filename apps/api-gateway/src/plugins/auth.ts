import type { FastifyInstance } from 'fastify';
import { jwtVerify } from 'jose';
import fp from 'fastify-plugin';
import { config } from '../config.js';

declare module 'fastify' {
  interface FastifyRequest {
    tenantId: string;
  }
}

// Pre-compute the raw HS256 key bytes once at startup
const JWT_KEY = new TextEncoder().encode(config.JWT_SECRET);

/**
 * JWT authentication plugin — uses `jose` for secure, vulnerability-free verification.
 *
 * Expects a Bearer token in Authorization header.
 * The token payload must include `tenantId`.
 *
 * Routes can opt out by adding `{ config: { public: true } }` to their schema options.
 */
export const authPlugin = fp(async (app: FastifyInstance) => {
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
        issuer: config.JWT_ISSUER,
        audience: config.JWT_AUDIENCE,
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

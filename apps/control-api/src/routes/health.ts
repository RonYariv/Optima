import type { FastifyInstance } from 'fastify';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', { config: { public: true } }, async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'control-api',
  }));
}

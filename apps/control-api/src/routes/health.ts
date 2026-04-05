import type { FastifyInstance } from 'fastify';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  const handler = async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'control-api',
  });

  app.get('/health',  { config: { public: true } }, handler);
  app.get('/healthz', { config: { public: true } }, handler);
}

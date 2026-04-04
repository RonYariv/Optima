import { buildServer } from './server.js';
import { config } from './config.js';

const app = await buildServer();

try {
  await app.listen({ port: config.PORT, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

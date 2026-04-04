import { createServer } from './server.js';
import { config } from './config.js';

async function main() {
  const app = await createServer();

  try {
    await app.listen({ port: config.PORT, host: config.HOST });
  } catch (err) {
    app.log.fatal(err, 'Fatal error starting server');
    process.exit(1);
  }
}

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection', err);
  process.exit(1);
});

await main();

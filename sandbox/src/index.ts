import { startMockMcpServers } from './mock-mcp/index.js';

const { stop } = await startMockMcpServers();
console.log('Mock MCP servers started on :4010 (filesystem) and :4011 (web-search)');
console.log('Press Ctrl+C to stop.\n');

process.on('SIGINT', () => {
  stop();
  process.exit(0);
});

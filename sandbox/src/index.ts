import 'dotenv/config';
import { OptimaClient } from '@agent-optima/sdk-node';
import { startMockMcpServers } from './mock-mcp/index.js';
import { runResearchBot } from './scenarios/research-bot.js';
import { runCodingAssistant } from './scenarios/coding-assistant.js';
import { runMultiAgentHandoff } from './scenarios/multi-agent-handoff.js';

const OPTIMA_URL = process.env['OPTIMA_URL'] ?? 'http://localhost:3000';
const OPTIMA_TOKEN = process.env['OPTIMA_TOKEN'] ?? '';
const TENANT_ID = process.env['TENANT_ID'] ?? 'sandbox';
const PROJECT_ID = process.env['PROJECT_ID'] ?? 'demo';

if (!OPTIMA_TOKEN) {
  console.error('ERROR: OPTIMA_TOKEN is not set. Copy sandbox/.env.example to sandbox/.env and fill in the token.');
  process.exit(1);
}

const client = new OptimaClient({ url: OPTIMA_URL, token: OPTIMA_TOKEN, silent: false });

const scenario = process.argv[2] ?? 'all';

console.log(`\n=== Optima Sandbox ===`);
console.log(`URL:      ${OPTIMA_URL}`);
console.log(`Tenant:   ${TENANT_ID}`);
console.log(`Project:  ${PROJECT_ID}`);
console.log(`Scenario: ${scenario}\n`);

const { stop } = await startMockMcpServers();
console.log('Mock MCP servers started on :4010 (filesystem) and :4011 (web-search)\n');

try {
  if (scenario === 'all' || scenario === 'research-bot') {
    await runResearchBot(client, TENANT_ID, PROJECT_ID);
  }
  if (scenario === 'all' || scenario === 'coding-assistant') {
    await runCodingAssistant(client, TENANT_ID, PROJECT_ID);
  }
  if (scenario === 'all' || scenario === 'multi-agent') {
    await runMultiAgentHandoff(client, TENANT_ID, PROJECT_ID);
  }
  console.log('\nAll scenarios complete. Open http://localhost:5173 to see the results.');
} finally {
  stop();
}

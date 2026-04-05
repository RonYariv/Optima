import type { AgentDefinition } from '@agent-optima/agentic'

export const echoAgent: AgentDefinition = {
  id: 'echo',
  name: 'Echo Agent',
  description: 'Repeats back what you say. Useful for testing LLM connectivity.',
  systemPrompt:
    'You are a helpful echo assistant. Acknowledge what the user says and repeat it back clearly.',
  tools: [],
}

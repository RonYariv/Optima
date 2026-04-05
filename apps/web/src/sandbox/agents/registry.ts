import type { AgentDefinition } from '@agent-optima/agentic'
import { echoAgent } from './echo-agent.js'
import { calculatorAgent } from './calculator-agent.js'

export const AGENT_REGISTRY: AgentDefinition[] = [echoAgent, calculatorAgent]

export { echoAgent, calculatorAgent }

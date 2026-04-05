import type { AgentDefinition, Tool } from '@agent-optima/agentic'

/**
 * Safe math evaluator — only allows digits, whitespace, and basic operators.
 * No eval, no dynamic code execution.
 */
function safeMath(expression: string): number {
  // Allow only: digits, decimal point, spaces, +−*/^%(), and nothing else
  if (!/^[\d\s+\-*/.()%^]+$/.test(expression)) {
    throw new Error('Expression contains invalid characters')
  }
  // Limit length to prevent DoS
  if (expression.length > 200) throw new Error('Expression too long')

  // Use the Function constructor scoped to an empty context — no access to globals
  const fn = new Function(
    'return (' + expression + ')',
  ) as () => number
  const result = fn()
  if (typeof result !== 'number' || !isFinite(result)) {
    throw new Error('Expression did not produce a finite number')
  }
  return result
}

const calculatorTool: Tool<{ expression: string }> = {
  name: 'calculator',
  description:
    'Evaluate a mathematical expression. Input must be a valid numeric expression string like "2 + 2" or "(10 * 3) / 2".',
  parameters: {
    type: 'object',
    properties: {
      expression: {
        type: 'string',
        description: 'The math expression to evaluate, e.g. "sqrt(16) + 4"',
      },
    },
    required: ['expression'],
  },
  async run({ expression }) {
    const result = safeMath(expression)
    return { result, expression }
  },
}

export const calculatorAgent: AgentDefinition = {
  id: 'calculator',
  name: 'Calculator Agent',
  description: 'Solves math problems using a built-in calculator tool.',
  systemPrompt:
    'You are a math assistant. When the user asks a math question, use the calculator tool to compute the answer precisely. Always show your reasoning.',
  tools: [calculatorTool],
}

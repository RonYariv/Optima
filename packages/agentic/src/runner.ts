import type { AgentDefinition, LLMAdapter, LLMMessage } from './types.js'

const MAX_TOOL_ROUNDS = 6

export interface TurnResult {
  /** Final assistant text response */
  assistantText: string
  /**
   * Full conversation so far, excluding system prompt.
   * Pass this back on the next turn as `priorHistory`.
   */
  updatedHistory: LLMMessage[]
}

/**
 * AgentRunner — drives the ReAct loop for a single agent.
 *
 * Usage:
 *   const runner = new AgentRunner(agentDef, adapter)
 *   let history: LLMMessage[] = []
 *   const { assistantText, updatedHistory } = await runner.run(history, userInput)
 *   history = updatedHistory  // keep for next turn
 */
export class AgentRunner {
  private agent: AgentDefinition
  private adapter: LLMAdapter

  constructor(agent: AgentDefinition, adapter: LLMAdapter) {
    this.agent = agent
    this.adapter = adapter
  }

  async run(priorHistory: LLMMessage[], userInput: string): Promise<TurnResult> {
    // Build the full message list for this turn
    const messages: LLMMessage[] = [
      { role: 'system', content: this.agent.systemPrompt },
      ...priorHistory,
      { role: 'user', content: userInput },
    ]

    let assistantText = ''

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await this.adapter.chat(messages, this.agent.tools)

      if (response.toolCalls && response.toolCalls.length > 0) {
        // Append assistant message that triggered the tool calls
        messages.push({
          role: 'assistant',
          content: response.content,
          tool_calls: response.toolCalls,
        })

        // Execute all tools and append their results
        for (const tc of response.toolCalls) {
          const tool = this.agent.tools?.find(t => t.name === tc.function.name)
          let result: unknown
          try {
            const args = JSON.parse(tc.function.arguments) as Record<string, unknown>
            result = tool
              ? await tool.run(args)
              : { error: `Tool "${tc.function.name}" not registered on this agent` }
          } catch (e) {
            result = { error: e instanceof Error ? e.message : String(e) }
          }

          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(result),
          })
        }
      } else {
        // No tool calls — this is the final response
        assistantText = response.content ?? ''
        messages.push({ role: 'assistant', content: assistantText })
        break
      }
    }

    // Strip the system prompt before returning so callers store only the user/assistant history
    const updatedHistory = messages.slice(1)
    return { assistantText, updatedHistory }
  }
}

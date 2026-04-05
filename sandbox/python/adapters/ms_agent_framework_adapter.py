from __future__ import annotations

from typing import Any, Callable

from agent_framework import Agent
from agent_framework.openai import OpenAIChatCompletionOptions


class MsAgentFrameworkAdapter:
    def __init__(
        self,
        *,
        client_factory: Callable[[Any, Any], Any],
        build_user_input: Callable[[list[Any]], str],
    ) -> None:
        self._client_factory = client_factory
        self._build_user_input = build_user_input

    async def run(
        self,
        agent_def: dict[str, Any],
        messages: list[Any],
        llm_config: Any,
        tools: dict[str, Any],
        bridge: Any,
    ) -> str:
        llm_client = self._client_factory(llm_config, bridge)
        tool_fns = [tools[name] for name in agent_def.get("tool_names", []) if name in tools]

        agent = Agent(
            client=llm_client,
            name=agent_def["name"],
            instructions=agent_def["instructions"],
            tools=tool_fns,
            default_options=OpenAIChatCompletionOptions(parallel_tool_calls=False),
        )

        user_input = self._build_user_input(messages)

        try:
            result = await agent.run(user_input)
            return str(result)
        except Exception as exc:
            if "tool_use_failed" not in str(exc) and "failed_generation" not in str(exc):
                raise

            retry_prompt = (
                "[IMPORTANT: You MUST call tools using the standard JSON function-calling format. "
                "Do NOT use XML or any other format. Call one tool at a time.]\n\n"
                f"{user_input}"
            )
            result = await agent.run(retry_prompt)
            return str(result)

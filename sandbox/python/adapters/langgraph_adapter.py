from __future__ import annotations

import time
from typing import Any, Callable


class LangGraphAdapter:
    def __init__(
        self,
        *,
        detect_provider: Callable[[str, str], str],
        extract_token_usage: Callable[[Any], tuple[int, int]],
        extract_text: Callable[[Any], str],
    ) -> None:
        self._detect_provider = detect_provider
        self._extract_token_usage = extract_token_usage
        self._extract_text = extract_text

    async def run(
        self,
        agent_def: dict[str, Any],
        messages: list[Any],
        llm_config: Any,
        tools: dict[str, Any],
        bridge: Any,
    ) -> str:
        try:
            from langchain_core.callbacks.base import AsyncCallbackHandler
            from langchain_core.messages import AIMessage, HumanMessage
            from langchain_openai import ChatOpenAI
            from langgraph.prebuilt import create_react_agent
        except ImportError as exc:
            raise RuntimeError(
                "LangGraph support requires 'langgraph' and 'langchain-openai'."
            ) from exc

        provider = self._detect_provider(llm_config.base_url, llm_config.model)
        extract_token_usage = self._extract_token_usage

        class LangGraphTelemetryHandler(AsyncCallbackHandler):
            def __init__(self) -> None:
                self._llm_start: dict[str, float] = {}
                self._tool_start: dict[str, float] = {}
                self._tool_name: dict[str, str] = {}

            async def on_llm_start(self, serialized: dict[str, Any], prompts: list[str], *, run_id: Any, **kwargs: Any) -> None:
                self._llm_start[str(run_id)] = time.perf_counter()

            async def on_llm_end(self, response: Any, *, run_id: Any, **kwargs: Any) -> None:
                started = self._llm_start.pop(str(run_id), None)
                elapsed_ms = int((time.perf_counter() - started) * 1000) if started else 0
                input_tokens, output_tokens = extract_token_usage(response)
                await bridge.model_call(
                    model_name=llm_config.model,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    latency_ms=elapsed_ms,
                    provider=provider,
                )

            async def on_llm_error(self, error: BaseException, *, run_id: Any, **kwargs: Any) -> None:
                started = self._llm_start.pop(str(run_id), None)
                elapsed_ms = int((time.perf_counter() - started) * 1000) if started else 0
                await bridge.model_call(
                    model_name=llm_config.model,
                    input_tokens=0,
                    output_tokens=0,
                    latency_ms=elapsed_ms,
                    provider=provider,
                    error={"type": type(error).__name__, "message": str(error)},
                )

            async def on_tool_start(
                self,
                serialized: dict[str, Any],
                input_str: str,
                *,
                run_id: Any,
                **kwargs: Any,
            ) -> None:
                key = str(run_id)
                self._tool_start[key] = time.perf_counter()
                self._tool_name[key] = serialized.get("name") or serialized.get("id") or "tool"

            async def on_tool_end(self, output: Any, *, run_id: Any, **kwargs: Any) -> None:
                key = str(run_id)
                started = self._tool_start.pop(key, None)
                tool_name = self._tool_name.pop(key, "tool")
                elapsed_ms = int((time.perf_counter() - started) * 1000) if started else 0
                await bridge.tool_call(tool_name=tool_name, latency_ms=elapsed_ms, success=True)
                await bridge.audit(
                    "tool_call",
                    name=tool_name,
                    output_data={"result": str(output)[:500]},
                    latency_ms=elapsed_ms,
                    success=True,
                )

            async def on_tool_error(self, error: BaseException, *, run_id: Any, **kwargs: Any) -> None:
                key = str(run_id)
                started = self._tool_start.pop(key, None)
                tool_name = self._tool_name.pop(key, "tool")
                elapsed_ms = int((time.perf_counter() - started) * 1000) if started else 0
                await bridge.tool_call(
                    tool_name=tool_name,
                    latency_ms=elapsed_ms,
                    success=False,
                    error_type=type(error).__name__,
                )
                await bridge.audit(
                    "tool_call",
                    name=tool_name,
                    latency_ms=elapsed_ms,
                    success=False,
                    error={"type": type(error).__name__, "message": str(error)},
                )

        callback_handler = LangGraphTelemetryHandler()
        llm = ChatOpenAI(
            api_key=llm_config.api_key,
            base_url=llm_config.base_url,
            model=llm_config.model,
            callbacks=[callback_handler],
            temperature=0,
        )

        tool_fns = [tools[name] for name in agent_def.get("tool_names", []) if name in tools]
        graph = create_react_agent(model=llm, tools=tool_fns, prompt=agent_def["instructions"])

        lc_messages: list[Any] = []
        for message in messages:
            if message.role == "user":
                lc_messages.append(HumanMessage(content=message.content))
            else:
                lc_messages.append(AIMessage(content=message.content))

        result = await graph.ainvoke(
            {"messages": lc_messages},
            config={"callbacks": [callback_handler]},
        )
        result_messages = result.get("messages", []) if isinstance(result, dict) else []
        if not result_messages:
            return self._extract_text(result)
        return self._extract_text(result_messages[-1])

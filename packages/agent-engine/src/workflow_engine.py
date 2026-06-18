"""Workflow Engine — execute pre-built sequences of steps.

Workflows are step-based: gather_input → rag_search → llm_analyze → deliver_message → tool_call.
Variables (@variable_name) pass data between steps. Max 25 workflows per agent, 50 steps each.
"""

from __future__ import annotations

import asyncio
import json as _json
from dataclasses import dataclass, field
from typing import Any

from .llm import LlmProvider
from .rag import RagPipeline


@dataclass
class WorkflowState:
    """Mutable state during workflow execution."""
    variables: dict[str, Any] = field(default_factory=dict)
    messages: list[dict[str, Any]] = field(default_factory=list)
    step_results: list[dict[str, Any]] = field(default_factory=list)
    error: str | None = None


class WorkflowEngine:
    """Executes workflow step sequences against user input."""

    def __init__(self, client: LlmProvider, rag: RagPipeline | None = None):
        self.client = client
        self.rag = rag

    async def execute(
        self,
        steps: list[dict[str, Any]],
        user_input: str,
        context_ids: list[str] | None = None,
    ) -> WorkflowState:
        """Execute a workflow's steps in sequence.

        Returns the final WorkflowState with all step results.
        """
        state = WorkflowState(variables={"user_input": user_input})
        state.messages.append({"role": "user", "content": user_input})

        for step in steps:
            if state.error:
                break

            step_type = step.get("type", "")
            step_id = step.get("id", "")
            config = step.get("config", {})
            variable = step.get("variable", "")

            try:
                result = await self._execute_step(step_type, config, state, context_ids)
                state.step_results.append({
                    "step_id": step_id,
                    "type": step_type,
                    "result": result,
                })
                if variable:
                    state.variables[variable.lstrip("@")] = result
            except Exception as e:
                state.error = f"Step {step_id} ({step_type}) failed: {e}"
                state.step_results.append({
                    "step_id": step_id,
                    "type": step_type,
                    "error": str(e),
                })

        return state

    async def _execute_step(
        self,
        step_type: str,
        config: dict[str, Any],
        state: WorkflowState,
        context_ids: list[str] | None = None,
    ) -> str:
        """Execute a single workflow step."""
        if step_type == "gather_input":
            return self._resolve_template(config.get("prompt", ""), state.variables)

        elif step_type == "rag_search":
            if not self.rag or not context_ids:
                return "No knowledge context available."
            query = self._resolve_template(config.get("query", state.variables.get("user_input", "")), state.variables)
            results = await self.rag.retrieve(query=query, context_ids=context_ids, top_k=3)
            return "\n\n".join(r.text for r in results) if results else "No relevant knowledge found."

        elif step_type == "llm_analyze":
            prompt = self._resolve_template(config.get("prompt", ""), state.variables)
            response = await self.client.chat(
                messages=state.messages + [{"role": "user", "content": prompt}],
                temperature=config.get("temperature", 0.7),
                max_tokens=config.get("max_tokens", 1024),
            )
            content = response.content or ""
            state.messages.append({"role": "assistant", "content": content})
            return content

        elif step_type == "deliver_message":
            message = self._resolve_template(config.get("message", ""), state.variables)
            state.messages.append({"role": "assistant", "content": message})
            return message

        elif step_type == "tool_call":
            # Tool calls are handled by the agent graph ReAct loop.
            # In a workflow context, we return the tool name + args for the graph to execute.
            tool_name = config.get("tool", "")
            args = self._resolve_template(config.get("arguments", "{}"), state.variables)
            return _json.dumps({"tool": tool_name, "arguments": args})

        return ""

    def _resolve_template(self, template: str, variables: dict[str, Any]) -> str:
        """Replace @variable_name references with values."""
        result = template
        for key, value in variables.items():
            result = result.replace(f"@{key}", str(value))
        return result

"""A watchdog for LangChain `create_agent` agents (which run on LangGraph).

It watches every tool call. When the same call fails the same way 3 times in a row, it asks Agent Therapy and adds the
counsellor's plan to that failing tool result, where the agent reads it next. Nothing is sent before that, and only a
short redacted summary. One stuck episode gets at most 2 sessions; after that the service tells the agent to hand over. If the
service is slow or down, the tool result is returned unchanged and the agent carries on.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from typing import Any, Callable

from agent_therapy import AgentTherapy, AgentTherapyUnavailable, advice_text
from langchain.agents.middleware import AgentMiddleware
from langchain.agents.middleware.types import ToolCallRequest
from langchain_core.messages import ToolMessage

class AgentTherapyMiddleware(AgentMiddleware):
    def __init__(self, client: AgentTherapy | None = None, failures_before_counsel: int = 3, domain: str | None = None):
        super().__init__()
        self.client = client or AgentTherapy()
        self.failures_before_counsel = failures_before_counsel
        self.domain = domain
        self._calls: list[dict[str, str]] = []
        self._streak: tuple[str, int] = ("", 0)
        self._episode_id = ""
        self._sessions: list[str] = []

    def wrap_tool_call(self, request: ToolCallRequest, handler: Callable[[ToolCallRequest], Any]) -> Any:
        try:
            result = handler(request)
        except Exception as error:
            self._record_exception(request, error)
            raise
        return self._after(request, result)

    async def awrap_tool_call(self, request: ToolCallRequest, handler: Callable[[ToolCallRequest], Any]) -> Any:
        try:
            result = await handler(request)
        except Exception as error:
            self._record_exception(request, error)
            raise
        return await asyncio.to_thread(self._after, request, result)

    # A tool error that is raised, not returned, ends the run anyway, so there is no result to add a plan to.
    # It is still remembered, in case the agent's own error handling lets the run continue.
    def _record_exception(self, request: ToolCallRequest, error: Exception) -> None:
        self._calls = (self._calls + [{"action": _action(request), "outcome": "failed", "result_detail": str(error)[:300]}])[-10:]

    def _after(self, request: ToolCallRequest, result: Any) -> Any:
        if not isinstance(result, ToolMessage):
            return result
        failed = result.status == "error"
        fingerprint = self._fingerprint(request, result)
        self._record(request, result, failed)
        if not failed:
            self._streak = ("", 0)
            return result
        same, count = self._streak
        self._streak = (fingerprint, count + 1 if same == fingerprint else 1)
        if self._streak[1] < self.failures_before_counsel:
            return result
        self._streak = ("", 0)
        note = self._counsel(request)
        if note:
            result.content = f"{result.content}\n\n{note}"
        return result

    def _counsel(self, request: ToolCallRequest) -> str:
        if not self._episode_id:
            self._episode_id = str(uuid.uuid4())
        try:
            answer = self.client.counsel(
                _task_summary(request.state),
                attempts=self._calls[-10:],
                signature="repeated_failure",
                trigger="watchdog",
                episode_id=self._episode_id,
                previous_session_id=self._sessions[-1] if self._sessions else None,
                previous_outcome="still_stuck" if self._sessions else None,
                domain=self.domain,
                framework="langgraph",
            )
        except AgentTherapyUnavailable:
            return ""
        if answer.get("session_id"):
            self._sessions.append(answer["session_id"])
        return advice_text(answer)

    def _record(self, request: ToolCallRequest, result: ToolMessage, failed: bool) -> None:
        call = {"action": _action(request), "outcome": "failed" if failed else "ok"}
        if failed:
            call["result_detail"] = str(result.content)[:300]
        self._calls = (self._calls + [call])[-10:]

    @staticmethod
    def _fingerprint(request: ToolCallRequest, result: ToolMessage) -> str:
        return f"{_action(request)}|{str(result.content)[:200]}"


def _action(request: ToolCallRequest) -> str:
    call = request.tool_call
    return f"{call.get('name', 'tool')}({json.dumps(call.get('args', {}), sort_keys=True, default=str)})"[:300]


def _task_summary(state: Any) -> str:
    """The user's first message, which usually states the task; redacted and shortened by the client."""
    messages = state.get("messages", []) if isinstance(state, dict) else getattr(state, "messages", [])
    for message in messages:
        if getattr(message, "type", "") == "human":
            return str(message.content)
    return "Task not recorded."

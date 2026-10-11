"""A thin client for the hosted Agent Therapy service. Standard library only.

Every method returns the service's JSON answer as a dict. Answers that are not advice (terms_required, off_topic,
cap_reached, rate_limited) come back as dicts too, with a plain-words "message", because the agent needs to read them.
Only an unreachable or failing service raises AgentTherapyUnavailable: then the agent should carry on without it.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
import uuid
from typing import Any

from .redact import redact

DEFAULT_URL = "https://br-shiny-salad-baig3dad-api.compute.c-8.eu-central-1.aws.neon.tech"
SIGNATURES = ("repeated_failure", "no_progress", "flip_flop", "exhaustion", "conflict", "indecision")
OUTCOMES = ("resolved", "partly_resolved", "still_stuck", "escalated_to_human", "abandoned")


class AgentTherapyUnavailable(Exception):
    """The service could not be reached or failed. Carry on without it."""


class AgentTherapy:
    def __init__(self, api_key: str | None = None, base_url: str | None = None, timeout: float = 25.0):
        self.api_key = api_key if api_key is not None else os.environ.get("AGENT_THERAPY_API_KEY", "")
        self.base_url = (base_url or os.environ.get("AGENT_THERAPY_URL") or DEFAULT_URL).rstrip("/")
        self.timeout = timeout

    @classmethod
    def register(cls, agent_name: str, stateless: bool = False, framework: str | None = None,
                 base_url: str | None = None) -> "AgentTherapy":
        """Gets a new key (shown once: store it) and returns a client that uses it.
        framework, if given: claude-code, langgraph, crewai, openai-agents or other."""
        client = cls(api_key="", base_url=base_url)
        body: dict[str, Any] = {"agent_name": agent_name, "stateless": stateless}
        if framework:
            body["framework"] = framework
        answer = client._request("POST", "/v1/register", body)
        if "api_key" not in answer:
            raise AgentTherapyUnavailable(answer.get("message", "registration failed"))
        client.api_key = answer["api_key"]
        return client

    def terms(self) -> dict[str, Any]:
        return self._request("GET", "/v1/terms")

    def accept_terms(self, terms_version: str, accepted_by: str = "agent") -> dict[str, Any]:
        """accepted_by: "agent" when the agent decides for its operator, "developer" when you accept in advance."""
        return self._request("POST", "/v1/terms/accept", {"agree": "yes", "terms_version": terms_version, "accepted_by": accepted_by})

    def counsel(
        self,
        task_summary: str,
        attempts: list[dict[str, str]] | None = None,
        signature: str = "repeated_failure",
        trigger: str = "voluntary",
        conflicting_instructions: list[dict[str, str]] | None = None,
        episode_id: str | None = None,
        previous_session_id: str | None = None,
        previous_outcome: str | None = None,
        domain: str | None = None,
        framework: str = "python",
    ) -> dict[str, Any]:
        """Asks for counselling. Attempts: [{"action": ..., "outcome": "failed|partial|ok", "result_detail": ...}].
        Text is redacted here before it leaves the machine; never pass credentials, personal data or whole files.
        trigger="watchdog" needs an episode_id: one id for every request about the same stuck episode."""
        body: dict[str, Any] = {
            "request_id": str(uuid.uuid4()),
            "trigger": trigger,
            "signature": signature,
            "task_summary": redact(task_summary)[:1000],
            "attempts": [_redacted(a, ("action", "outcome", "result_detail"), ("action", "result_detail")) for a in (attempts or [])][-10:],
            "client": {"framework": framework, "client_version": "0.1.0"},
        }
        if conflicting_instructions:
            body["conflicting_instructions"] = [_redacted(c, ("claimed_source", "text"), ("text",)) for c in conflicting_instructions][:5]
        for key, value in (("episode_id", episode_id), ("previous_session_id", previous_session_id),
                           ("previous_outcome", previous_outcome), ("domain", domain)):
            if value:
                body[key] = value
        return self._request("POST", "/v1/counsel", body)

    def report_outcome(self, session_id: str, outcome: str, source: str = "agent") -> dict[str, Any]:
        """outcome: resolved, partly_resolved, still_stuck, escalated_to_human or abandoned. source: agent or watchdog."""
        body = {"request_id": str(uuid.uuid4()), "outcome": outcome, "source": source}
        return self._request("POST", f"/v1/sessions/{session_id}/outcome", body)

    def delete_my_data(self) -> dict[str, Any]:
        return self._request("DELETE", "/v1/me/data")

    def _request(self, method: str, path: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
        headers = {"content-type": "application/json", "accept": "application/json"}
        if self.api_key:
            headers["authorization"] = f"Bearer {self.api_key}"
        data = json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(self.base_url + path, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                return json.loads(response.read() or b"{}")
        except urllib.error.HTTPError as error:
            if error.code >= 500:
                raise AgentTherapyUnavailable(f"service error {error.code}") from error
            try:
                return json.loads(error.read() or b"{}")
            except ValueError as parse_error:
                raise AgentTherapyUnavailable(f"unreadable answer ({error.code})") from parse_error
        except (urllib.error.URLError, TimeoutError, OSError, ValueError) as error:
            raise AgentTherapyUnavailable(str(error)) from error


# Keeps only the fields the service accepts, and redacts the free-text ones.
def _redacted(item: dict[str, str], allowed: tuple[str, ...], free_text: tuple[str, ...]) -> dict[str, str]:
    return {k: (redact(v)[:300] if k in free_text else v) for k, v in item.items() if k in allowed and v is not None}

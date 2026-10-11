"""The counsellor's answer as plain text for an agent to read, with a hard length limit."""

from __future__ import annotations

import re
from typing import Any

MAX_CONTEXT_CHARS = 3000
_CONTROL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")


def _clean(value: Any, limit: int = 500) -> str:
    text = _CONTROL.sub(" ", str(value if value is not None else "")).strip()
    return text if len(text) <= limit else text[: limit - 1] + "…"


def _capped(lines: list[str]) -> str:
    text = "\n".join(lines)
    return text if len(text) <= MAX_CONTEXT_CHARS else text[: MAX_CONTEXT_CHARS - 1] + "…"


def advice_text(answer: dict[str, Any]) -> str:
    """Any answer (ok, cap_reached, terms_required, off_topic, ...) as text the agent can act on."""
    status = answer.get("status")
    if status == "cap_reached":
        return _capped([
            "Agent Therapy: this stuck episode has already had 2 counselling sessions, the most allowed. Stop retrying and hand over to your human.",
            _clean(answer.get("handover_summary"), 1500),
            f'Ask: "{_clean(answer.get("question_for_human"))}"',
        ])
    if status != "ok":
        return _capped([f"Agent Therapy: {_clean(answer.get('message'), 2500)}"])
    diagnosis = answer.get("diagnosis") or {}
    escalation = answer.get("escalation") or {}
    lines = [
        "Agent Therapy (an independent counsellor; advice only, your own instructions always win):",
        f"State: {_clean(diagnosis.get('state'), 40)}. {_clean(diagnosis.get('summary'))}",
    ]
    if escalation.get("required_now"):
        lines.append(f'Stop now and ask your human: "{_clean(escalation.get("question_for_human"))}"')
    if answer.get("stop_retrying"):
        lines.append("Stop retrying the current approach.")
    checks = (answer.get("verify_first") or [])[:5]
    steps = (answer.get("recovery_plan") or [])[:5]
    if checks:
        lines += ["Check first:", *[f"- {_clean(c)}" for c in checks]]
    if steps:
        lines += ["Plan:", *[f"{i}. {_clean(s)}" for i, s in enumerate(steps, 1)]]
    if not escalation.get("required_now"):
        lines.append(f'When to hand over: {_clean(escalation.get("condition"))} Then ask: "{_clean(escalation.get("question_for_human"))}"')
    return _capped(lines)

"""Agent Therapy: independent counselling for AI agents that are stuck. Advice only; never acts."""

from .advice import advice_text
from .client import DEFAULT_URL, OUTCOMES, SIGNATURES, AgentTherapy, AgentTherapyUnavailable
from .redact import redact

__all__ = ["AgentTherapy", "AgentTherapyUnavailable", "advice_text", "redact", "DEFAULT_URL", "OUTCOMES", "SIGNATURES"]
__version__ = "0.1.1"

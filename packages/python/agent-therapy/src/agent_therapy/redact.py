"""Removes secret-shaped text, email addresses and phone numbers before anything is sent.

Same pattern list as the Agent Therapy server and the Claude Code watchdog; keep them in step.
Best effort: it cannot catch names, addresses or identifying stories.
"""

import re

_SECRET_LABEL = r"(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|client[_-]?secret|aws_secret_access_key)"

PATTERNS: list[tuple[str, re.Pattern[str], str | None]] = [
    ("private_key", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)"), None),
    ("connection_string", re.compile(r"\b([a-z][a-z0-9+.-]*://)[^\s:@/]+:[^\s@/]+@", re.I), r"\1[REDACTED:credentials]@"),
    ("aws_access_key", re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b"), None),
    ("github_token", re.compile(r"\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{20,})\b"), None),
    ("anthropic_key", re.compile(r"\bsk-ant-[A-Za-z0-9_-]{20,}"), None),
    ("openai_key", re.compile(r"\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}"), None),
    ("slack_token", re.compile(r"\bxox[abprs]-[A-Za-z0-9-]{10,}"), None),
    ("stripe_key", re.compile(r"\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}\b"), None),
    ("google_api_key", re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b"), None),
    ("agent_therapy_key", re.compile(r"\bat_live_[A-Za-z0-9_-]{20,}"), None),
    ("jwt", re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}"), None),
    ("bearer_token", re.compile(r"\b(Bearer\s+)[A-Za-z0-9._~+/-]{16,}=*", re.I), r"\1[REDACTED:bearer_token]"),
    ("secret_value", re.compile(r"\b(" + _SECRET_LABEL + r"""\s*["']?\s*[:=]\s*["']?)[^\s"',;]{4,}""", re.I), r"\1[REDACTED:secret_value]"),
    ("email", re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"), None),
    ("phone", re.compile(r"(?<![\w+])\+\d{1,3}[\s.-]?\(?\d{1,4}\)?(?:[\s.-]?\d{2,4}){2,4}(?!\w)"), None),
    ("phone", re.compile(r"(?<![\w.:/-])\(?0\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}(?![\w.:/-])"), None),
    ("phone", re.compile(r"(?<![\w.:/-])\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?![\w.:/-])"), None),
]


def redact(text: object) -> str:
    out = str(text)
    for kind, pattern, keep in PATTERNS:
        out = pattern.sub(keep or f"[REDACTED:{kind}]", out)
    return out

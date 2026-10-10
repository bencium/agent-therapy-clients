// Removes secret-shaped text, email addresses and phone numbers before anything is written to disk or sent.
// Same pattern list as the Agent Therapy server (src/lib/redact.ts in the service repo); keep the two in step.
// Best effort: it cannot catch names, addresses or identifying stories.

export const PATTERNS = [
  { kind: "private_key", regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g },
  { kind: "connection_string", regex: /\b([a-z][a-z0-9+.-]*:\/\/)[^\s:@/]+:[^\s@/]+@/gi, keep: (_m, scheme) => `${scheme}[REDACTED:credentials]@` },
  { kind: "aws_access_key", regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { kind: "github_token", regex: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{20,})\b/g },
  { kind: "anthropic_key", regex: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
  { kind: "openai_key", regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/g },
  { kind: "slack_token", regex: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g },
  { kind: "stripe_key", regex: /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g },
  { kind: "google_api_key", regex: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { kind: "agent_therapy_key", regex: /\bat_live_[A-Za-z0-9_-]{20,}/g },
  { kind: "jwt", regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  { kind: "bearer_token", regex: /\b(Bearer\s+)[A-Za-z0-9._~+/-]{16,}=*/gi, keep: (_m, label) => `${label}[REDACTED:bearer_token]` },
  {
    kind: "secret_value",
    regex: /\b((?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|client[_-]?secret|aws_secret_access_key)\s*["']?\s*[:=]\s*["']?)[^\s"',;]{4,}/gi,
    keep: (_m, label) => `${label}[REDACTED:secret_value]`,
  },
  { kind: "email", regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { kind: "phone", regex: /(?<![\w+])\+\d{1,3}[\s.-]?\(?\d{1,4}\)?(?:[\s.-]?\d{2,4}){2,4}(?!\w)/g },
  { kind: "phone", regex: /(?<![\w.:/-])\(?0\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}(?![\w.:/-])/g },
  { kind: "phone", regex: /(?<![\w.:/-])\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?![\w.:/-])/g },
];

export function redactText(input) {
  return PATTERNS.reduce(
    (out, p) => out.replace(p.regex, (match, ...groups) => (p.keep ? p.keep(match, ...groups) : `[REDACTED:${p.kind}]`)),
    String(input),
  );
}

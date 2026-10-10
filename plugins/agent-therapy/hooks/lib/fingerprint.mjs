// Fingerprints that let the watchdog see "the same call" and "the same failure" across retries (build spec section 8).

import { createHash } from "node:crypto";

const sha256 = (text) => createHash("sha256").update(text).digest("hex");

// Values that change between otherwise identical retries: IDs, timestamps, long hex strings and long numbers.
export function normalise(text) {
  return String(text)
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<uuid>")
    .replace(/\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?\b/g, "<time>")
    .replace(/\b[0-9a-f]{16,}\b/gi, "<hex>")
    .replace(/\b\d{6,}\b/g, "<number>");
}

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

// Bash's "description" is Claude's own label for the command and changes between identical retries, so it is ignored.
export function inputHash(toolName, toolInput) {
  const { description: _ignored, ...input } = toolInput ?? {};
  return sha256(`${toolName}\n${normalise(stableStringify(input))}`);
}

// File paths count by their base name, so the same error from a different temp directory still matches.
export function errorHash(error) {
  const first = normalise(String(error ?? "").slice(0, 300)).replace(/(?:[A-Za-z]:)?(?:[\\/][\w.@-]+)+[\\/]([\w.@-]+)/g, "$1");
  return sha256(first);
}

export function contentHash(content) {
  return sha256(content);
}

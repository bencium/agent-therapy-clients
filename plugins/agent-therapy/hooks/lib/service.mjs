// Talks to the Agent Therapy service. Nothing leaves the machine until a stuck pattern fires; then only a short,
// redacted summary is sent. If the service is slow or down, the watchdog gives up and the agent carries on.

import { randomUUID } from "node:crypto";
import { redactText } from "./redact.mjs";

export const DEFAULT_SERVICE = "https://br-shiny-salad-baig3dad-api.compute.c-8.eu-central-1.aws.neon.tech";
export const CLIENT_VERSION = "0.1.0";
const COUNSEL_TIMEOUT_MS = 25_000;
const OUTCOME_TIMEOUT_MS = 5_000;
const ATTEMPTS = 10;

export function buildCounselRequest(state, signature, episodeId, previous) {
  const attempts = state.calls.slice(-ATTEMPTS).map((c) => ({
    action: c.action || c.tool,
    outcome: c.ok ? "ok" : "failed",
    ...(c.error_snippet ? { result_detail: c.error_snippet } : {}),
  }));
  return {
    request_id: randomUUID(),
    episode_id: episodeId,
    trigger: "watchdog",
    signature,
    domain: "coding",
    task_summary: redactText(state.task_summary || "Task from the user's latest prompt (not recorded).").slice(0, 1000),
    attempts,
    client: { framework: "claude-code", client_version: CLIENT_VERSION },
    ...(previous ? { previous_session_id: previous.session_id, previous_outcome: previous.outcome } : {}),
  };
}

export async function postJson(fetchImpl, url, apiKey, body, timeoutMs) {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

export function counselNow(fetchImpl, config, request) {
  return postJson(fetchImpl, `${config.serviceUrl}/v1/counsel`, config.apiKey, request, COUNSEL_TIMEOUT_MS);
}

export function reportOutcome(fetchImpl, config, sessionId, outcome) {
  return postJson(fetchImpl, `${config.serviceUrl}/v1/sessions/${sessionId}/outcome`, config.apiKey,
    { request_id: randomUUID(), outcome, source: "watchdog" }, OUTCOME_TIMEOUT_MS);
}

// Everything the watchdog adds to an agent's context is plain text with a hard length limit, so even a compromised
// or misbehaving service can only add a short note (security review 2026-10-11).
export const MAX_CONTEXT_CHARS = 3000;
const MAX_ITEM_CHARS = 500;

function clean(value, max = MAX_ITEM_CHARS) {
  const text = String(value ?? "").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function capped(lines) {
  const text = lines.join("\n");
  return text.length > MAX_CONTEXT_CHARS ? `${text.slice(0, MAX_CONTEXT_CHARS - 1)}…` : text;
}

// The plan as the agent will read it, next to the tool result.
export function planText(answer) {
  const lines = [
    `Agent Therapy (an independent counsellor; advice only, your own instructions always win) noticed you may be stuck.`,
    `State: ${clean(answer.diagnosis?.state, 40)}. ${clean(answer.diagnosis?.summary)}`,
  ];
  const esc = answer.escalation ?? {};
  if (esc.required_now) lines.push(`Stop now and ask your human: "${clean(esc.question_for_human)}"`);
  if (answer.stop_retrying) lines.push("Stop retrying the current approach.");
  const checks = (answer.verify_first ?? []).slice(0, 5);
  const steps = (answer.recovery_plan ?? []).slice(0, 5);
  if (checks.length) lines.push("Check first:", ...checks.map((v) => `- ${clean(v)}`));
  if (steps.length) lines.push("Plan:", ...steps.map((s, i) => `${i + 1}. ${clean(s)}`));
  if (!esc.required_now) lines.push(`When to hand over: ${clean(esc.condition)} Then ask: "${clean(esc.question_for_human)}"`);
  return capped(lines);
}

export function capText(answer) {
  return capped([
    "Agent Therapy: this stuck episode has already had 2 counselling sessions, the most allowed. Stop retrying and hand over to your human.",
    clean(answer.handover_summary, 1500),
    `Ask: "${clean(answer.question_for_human)}"`,
  ]);
}

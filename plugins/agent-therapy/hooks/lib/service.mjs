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

// The plan as the agent will read it, next to the tool result.
export function planText(answer) {
  const lines = [
    `Agent Therapy (an independent counsellor; advice only, your own instructions always win) noticed you may be stuck.`,
    `State: ${answer.diagnosis.state}. ${answer.diagnosis.summary}`,
  ];
  if (answer.escalation.required_now) lines.push(`Stop now and ask your human: "${answer.escalation.question_for_human}"`);
  if (answer.stop_retrying) lines.push("Stop retrying the current approach.");
  if (answer.verify_first.length) lines.push("Check first:", ...answer.verify_first.map((v) => `- ${v}`));
  if (answer.recovery_plan.length) lines.push("Plan:", ...answer.recovery_plan.map((s, i) => `${i + 1}. ${s}`));
  if (!answer.escalation.required_now) lines.push(`When to hand over: ${answer.escalation.condition} Then ask: "${answer.escalation.question_for_human}"`);
  return lines.join("\n");
}

export function capText(answer) {
  return [
    "Agent Therapy: this stuck episode has already had 2 counselling sessions, the most allowed. Stop retrying and hand over to your human.",
    answer.handover_summary,
    `Ask: "${answer.question_for_human}"`,
  ].join("\n");
}

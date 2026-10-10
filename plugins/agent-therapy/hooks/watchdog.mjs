#!/usr/bin/env node
// Agent Therapy watchdog for Claude Code. Node 20+, no dependencies.
// Hook modes: prompt (UserPromptSubmit), post (PostToolUse), failure (PostToolUseFailure), pre (PreToolUse),
// release (UserPromptExpansion of /agent-therapy:release, which only a person can type).

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";
import { contentHash } from "./lib/fingerprint.mjs";
import { redactText } from "./lib/redact.mjs";
import { observe, startFollowUp } from "./lib/rules.mjs";
import { buildCounselRequest, capText, counselNow, DEFAULT_SERVICE, planText, reportOutcome } from "./lib/service.mjs";
import { loadState, loadStops, logLine, saveState, saveStops } from "./lib/state.mjs";

const RELEASE_HINT = "A person must review what happened, then type /agent-therapy:release to let the agent continue.";

export function configFrom(env) {
  return {
    apiKey: env.CLAUDE_PLUGIN_OPTION_API_KEY || env.AGENT_THERAPY_API_KEY || "",
    serviceUrl: (env.CLAUDE_PLUGIN_OPTION_SERVICE_URL || env.AGENT_THERAPY_URL || DEFAULT_SERVICE).replace(/\/+$/, ""),
    hardStop: ["true", "1", "yes"].includes(String(env.CLAUDE_PLUGIN_OPTION_HARD_STOP ?? "").toLowerCase()),
  };
}

// Returns the hook's JSON output, or null for no output. Never throws: a broken watchdog must not break the session.
export async function handle(mode, input, env = process.env, fetchImpl = fetch) {
  const projectDir = env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  try {
    if (mode === "pre") return hardStopCheck(projectDir, input);
    if (mode === "release") return release(projectDir, input);
    if (mode === "prompt") return rememberPrompt(projectDir, input);
    if (mode === "post" || mode === "failure") return await afterTool(mode, projectDir, input, configFrom(env), fetchImpl);
    return null;
  } catch (error) {
    logLine(projectDir, `${mode}: ${error instanceof Error ? error.message : "unknown error"}`);
    return null;
  }
}

function hardStopCheck(projectDir, input) {
  const stop = loadStops(projectDir)[input.session_id];
  if (!stop) return null;
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: `Agent Therapy hard stop: this stuck episode reached its counselling limit (episode ${stop.episode_id}). ${RELEASE_HINT}`,
    },
  };
}

function release(projectDir, input) {
  if (!String(input.command_name ?? "").endsWith("release")) return null;
  const stops = loadStops(projectDir);
  const had = Boolean(stops[input.session_id]);
  delete stops[input.session_id];
  saveStops(projectDir, stops);
  return { hookSpecificOutput: { hookEventName: "UserPromptExpansion",
    additionalContext: had ? "The person running this session released the Agent Therapy hard stop." : "There was no Agent Therapy hard stop to release." } };
}

function rememberPrompt(projectDir, input) {
  const state = loadState(projectDir, input.session_id);
  state.task_summary = redactText(String(input.prompt ?? "")).slice(0, 1000);
  saveState(projectDir, input.session_id, state);
  return null;
}

async function afterTool(mode, projectDir, input, config, fetchImpl) {
  const state = loadState(projectDir, input.session_id);
  const call = toCall(mode, input, projectDir);
  const { fired, followUpOutcome } = observe(state, call);
  if (followUpOutcome && state.last_outcome && config.apiKey) {
    await reportOutcome(fetchImpl, config, state.last_outcome.session_id, followUpOutcome)
      .catch((e) => logLine(projectDir, `outcome report failed: ${e.message}`));
    if (followUpOutcome === "resolved") delete state.episodes[state.last_outcome.signature];
  }
  let context = null;
  if (fired) {
    if (config.apiKey) context = await counselFor(fired, state, config, projectDir, input.session_id, fetchImpl);
    else logLine(projectDir, `${fired} detected, but no API key is configured`);
  }
  saveState(projectDir, input.session_id, state);
  if (!context) return null;
  return { hookSpecificOutput: { hookEventName: mode === "post" ? "PostToolUse" : "PostToolUseFailure", additionalContext: context } };
}

function toCall(mode, input, projectDir) {
  const filePath = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
  return {
    tool: input.tool_name,
    input: input.tool_input ?? {},
    ok: mode === "post",
    error: mode === "failure" ? input.error : null,
    filePath,
    fileHash: mode === "post" && filePath ? hashFile(isAbsolute(filePath) ? filePath : join(projectDir, filePath)) : null,
    at: new Date().toISOString(),
  };
}

function hashFile(path) {
  try {
    return contentHash(readFileSync(path));
  } catch {
    return null;
  }
}

// Opens or reuses the episode for this pattern, asks the counsellor, and turns the answer into context for the agent.
async function counselFor(signature, state, config, projectDir, sessionId, fetchImpl) {
  const episode = (state.episodes[signature] ??= { episode_id: randomUUID(), opened_at: new Date().toISOString(), counsel_count: 0 });
  const previous = state.last_outcome?.signature === signature ? state.last_outcome : null;
  let reply;
  try {
    reply = await counselNow(fetchImpl, config, buildCounselRequest(state, signature, episode.episode_id, previous));
    if (reply.status === 404 && /episode closed/.test(reply.body?.message ?? "")) {
      state.episodes[signature] = { episode_id: randomUUID(), opened_at: new Date().toISOString(), counsel_count: 0 };
      reply = await counselNow(fetchImpl, config, buildCounselRequest(state, signature, state.episodes[signature].episode_id, null));
    }
  } catch (error) {
    logLine(projectDir, `counsel for ${signature} failed: ${error instanceof Error ? error.name : "unknown"}`);
    return null;
  }

  const answer = reply.body ?? {};
  if (reply.status === 200 && answer.status === "ok") {
    state.episodes[signature].counsel_count += 1;
    startFollowUp(state, answer.session_id, signature);
    return planText(answer);
  }
  if (reply.status === 200 && answer.status === "cap_reached") {
    if (config.hardStop) {
      const stops = loadStops(projectDir);
      stops[sessionId] = { episode_id: answer.episode_id, at: new Date().toISOString() };
      saveStops(projectDir, stops);
      return `${capText(answer)}\n${RELEASE_HINT}`;
    }
    return capText(answer);
  }
  logLine(projectDir, `counsel for ${signature} returned ${reply.status} ${answer.status ?? ""}: ${String(answer.message ?? "").slice(0, 200)}`);
  return null;
}

async function readStdin() {
  let text = "";
  for await (const chunk of process.stdin) text += chunk;
  return text ? JSON.parse(text) : {};
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const output = await handle(process.argv[2], await readStdin().catch(() => ({})));
  if (output) process.stdout.write(JSON.stringify(output));
}

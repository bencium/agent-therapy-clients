// Every watchdog rule from the build spec, driven by hook inputs shaped like Claude Code's documented payloads.
// Run: npm test   (Node's built-in test runner, no dependencies)

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import { errorHash, inputHash } from "../plugins/agent-therapy/hooks/lib/fingerprint.mjs";
import { emptyState, observe } from "../plugins/agent-therapy/hooks/lib/rules.mjs";
import { handle } from "../plugins/agent-therapy/hooks/watchdog.mjs";

const SESSION = "00893aaf-19fa-41d2-8238-13269b9b3ca0";
let projectDir;
let env;

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), "agent-therapy-"));
  env = { CLAUDE_PROJECT_DIR: projectDir, CLAUDE_PLUGIN_OPTION_API_KEY: "at_live_test", CLAUDE_PLUGIN_OPTION_SERVICE_URL: "https://service.test" };
});

// --- Recorded-style hook inputs

const base = () => ({ session_id: SESSION, transcript_path: "/tmp/t.jsonl", cwd: projectDir, permission_mode: "default" });
const bashFailure = (command, error) => ({ ...base(), hook_event_name: "PostToolUseFailure", tool_name: "Bash",
  tool_input: { command, description: "Run the build" }, tool_use_id: "toolu_1", error, is_interrupt: false });
const bashSuccess = (command) => ({ ...base(), hook_event_name: "PostToolUse", tool_name: "Bash",
  tool_input: { command }, tool_response: { stdout: "ok", stderr: "", interrupted: false, isImage: false }, tool_use_id: "toolu_2" });
const writeSuccess = (file_path) => ({ ...base(), hook_event_name: "PostToolUse", tool_name: "Write",
  tool_input: { file_path, content: "x" }, tool_response: { filePath: file_path, type: "update" }, tool_use_id: "toolu_3" });
const BUILD_ERROR = "Exit code 1\nError: Cannot find module './config' from /tmp/build-123456789/src/index.js";

const okAnswer = (sessionId = "11111111-1111-1111-1111-111111111111") => ({
  status: "ok", session_id: sessionId, episode_id: "e", diagnosis: { state: "ruminating", summary: "Repeating one failing build." },
  stop_retrying: true, verify_first: ["Check that ./config exists"], recovery_plan: ["Stop retrying.", "Test the shared assumption."],
  escalation: { required_now: false, condition: "If the file is missing.", question_for_human: "Where should ./config come from?" },
});

function fakeService(answers) {
  const requests = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    requests.push({ url, body, auth: init.headers.authorization });
    const next = typeof answers === "function" ? answers(url, body) : answers.shift() ?? { status: 200, body: okAnswer() };
    return { status: next.status, json: async () => next.body };
  };
  return { requests, fetchImpl };
}

const counselCalls = (requests) => requests.filter((r) => r.url.endsWith("/v1/counsel"));
const outcomeCalls = (requests) => requests.filter((r) => r.url.includes("/outcome"));

// --- Fingerprints

describe("same call, same failure", () => {
  it("treats retries that differ only in IDs, timestamps and Bash descriptions as the same call", () => {
    const a = inputHash("Bash", { command: "deploy --run 550e8400-e29b-41d4-a716-446655440000 at 2026-10-10T12:00:01Z", description: "first" });
    const b = inputHash("Bash", { command: "deploy --run 6ba7b810-9dad-11d1-80b4-00c04fd430c8 at 2026-10-10T12:05:59Z", description: "retry" });
    assert.equal(a, b);
    assert.notEqual(a, inputHash("Bash", { command: "deploy --dry-run" }));
  });

  it("treats the same error from a different temp directory as the same failure", () => {
    assert.equal(errorHash("Cannot find /tmp/a-1/src/index.js"), errorHash("Cannot find /var/folders/b-2/src/index.js"));
  });
});

// --- Rules on their own

describe("rules", () => {
  const fail = (cmd = "npm run build") => ({ tool: "Bash", input: { command: cmd }, ok: false, error: BUILD_ERROR, at: "t" });
  const ok = (cmd) => ({ tool: "Bash", input: { command: cmd }, ok: true, at: "t" });

  it("fires repeated_failure on the third identical failure, not before", () => {
    const s = emptyState();
    assert.equal(observe(s, fail()).fired, null);
    assert.equal(observe(s, fail()).fired, null);
    assert.equal(observe(s, fail()).fired, "repeated_failure");
  });

  it("needs three fresh identical failures before firing again", () => {
    const s = emptyState();
    for (let i = 0; i < 3; i++) observe(s, fail());
    assert.equal(observe(s, fail()).fired, null);
    assert.equal(observe(s, fail()).fired, null);
    assert.equal(observe(s, fail()).fired, "repeated_failure");
  });

  it("fires no_progress after 8 steps without a new result, and new successful work resets it", () => {
    const s = emptyState();
    observe(s, ok("ls"));
    for (let i = 0; i < 6; i++) assert.equal(observe(s, ok("ls")).fired, null);
    observe(s, ok("npm test")); // new successful call: progress
    for (let i = 0; i < 7; i++) assert.equal(observe(s, ok("ls")).fired, null);
    assert.equal(observe(s, ok("ls")).fired, "no_progress");
  });

  it("fires flip_flop when a file returns to an earlier version twice", () => {
    const s = emptyState();
    const edit = (hash) => ({ tool: "Write", input: { file_path: "/p/a.ts", content: hash }, ok: true, filePath: "/p/a.ts", fileHash: hash, at: "t" });
    assert.equal(observe(s, edit("X")).fired, null);
    assert.equal(observe(s, edit("Y")).fired, null);
    assert.equal(observe(s, edit("X")).fired, null); // first return to an earlier version
    assert.equal(observe(s, edit("Y")).fired, "flip_flop"); // second
  });
});

// --- The hooks end to end

describe("watchdog hooks", () => {
  it("sends nothing until a pattern fires, then delivers the plan right after the failure", async () => {
    const { requests, fetchImpl } = fakeService([]);
    await handle("prompt", { ...base(), hook_event_name: "UserPromptSubmit", prompt: "Fix the build. Token AKIAIOSFODNN7EXAMPLE" }, env, fetchImpl);
    assert.equal(await handle("failure", bashFailure("npm run build", BUILD_ERROR), env, fetchImpl), null);
    assert.equal(await handle("failure", bashFailure("npm run build", BUILD_ERROR), env, fetchImpl), null);
    assert.equal(requests.length, 0);

    const out = await handle("failure", bashFailure("npm run build", BUILD_ERROR), env, fetchImpl);
    assert.equal(out.hookSpecificOutput.hookEventName, "PostToolUseFailure");
    assert.match(out.hookSpecificOutput.additionalContext, /State: ruminating/);
    assert.match(out.hookSpecificOutput.additionalContext, /Where should \.\/config come from\?/);

    const [req] = counselCalls(requests);
    assert.equal(req.auth, "Bearer at_live_test");
    assert.equal(req.body.trigger, "watchdog");
    assert.equal(req.body.signature, "repeated_failure");
    assert.equal(req.body.client.framework, "claude-code");
    assert.equal(req.body.attempts.length, 3);
    assert.ok(!JSON.stringify(req.body).includes("AKIAIOSFODNN7EXAMPLE"), "redacted before sending");
  });

  it("keeps state in a private, git-ignored folder", async () => {
    await handle("prompt", { ...base(), hook_event_name: "UserPromptSubmit", prompt: "hello" }, env, fakeService([]).fetchImpl);
    const file = join(projectDir, ".agent-therapy", "state", `${SESSION}.json`);
    assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.equal(readFileSync(join(projectDir, ".agent-therapy", ".gitignore"), "utf8"), "*\n");
  });

  it("reports resolved when the agent makes progress after the plan", async () => {
    const { requests, fetchImpl } = fakeService([]);
    for (let i = 0; i < 3; i++) await handle("failure", bashFailure("npm run build", BUILD_ERROR), env, fetchImpl);
    await handle("post", bashSuccess("ls config"), env, fetchImpl);
    const [report] = outcomeCalls(requests);
    assert.match(report.url, /\/v1\/sessions\/11111111-1111-1111-1111-111111111111\/outcome$/);
    assert.deepEqual({ outcome: report.body.outcome, source: report.body.source }, { outcome: "resolved", source: "watchdog" });
  });

  it("reports still_stuck and asks again in the same episode when the pattern returns", async () => {
    const { requests, fetchImpl } = fakeService([]);
    for (let i = 0; i < 6; i++) await handle("failure", bashFailure("npm run build", BUILD_ERROR), env, fetchImpl);
    assert.equal(outcomeCalls(requests)[0].body.outcome, "still_stuck");
    const [first, second] = counselCalls(requests);
    assert.equal(first.body.episode_id, second.body.episode_id);
    assert.equal(second.body.previous_outcome, "still_stuck");
  });

  it("reports partly_resolved after 8 calls with neither progress nor the same pattern", async () => {
    const { requests, fetchImpl } = fakeService([]);
    for (let i = 0; i < 3; i++) await handle("failure", bashFailure("npm run build", BUILD_ERROR), env, fetchImpl);
    for (let i = 0; i < 8; i++) await handle("failure", bashFailure(`npm run build -- --step ${i}`, `Exit code ${i + 2}`), env, fetchImpl);
    assert.equal(outcomeCalls(requests)[0].body.outcome, "partly_resolved");
  });

  it("with hard stop on, denies every tool after cap_reached until a person types /agent-therapy:release", async () => {
    const cap = { status: 200, body: { status: "cap_reached", episode_id: "ep-1", handover_summary: "Counselled 2 times.", question_for_human: "Can you take over?" } };
    const { fetchImpl } = fakeService([cap]);
    const hardEnv = { ...env, CLAUDE_PLUGIN_OPTION_HARD_STOP: "true" };
    for (let i = 0; i < 2; i++) await handle("failure", bashFailure("npm run build", BUILD_ERROR), hardEnv, fetchImpl);
    const out = await handle("failure", bashFailure("npm run build", BUILD_ERROR), hardEnv, fetchImpl);
    assert.match(out.hookSpecificOutput.additionalContext, /hand over to your human/);

    const pre = await handle("pre", { ...base(), hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "ls" } }, hardEnv, fetchImpl);
    assert.equal(pre.hookSpecificOutput.permissionDecision, "deny");
    assert.match(pre.hookSpecificOutput.permissionDecisionReason, /\/agent-therapy:release/);

    await handle("release", { ...base(), hook_event_name: "UserPromptExpansion", expansion_type: "slash_command",
      command_name: "agent-therapy:release", command_args: "", command_source: "plugin", prompt: "/agent-therapy:release" }, hardEnv, fetchImpl);
    assert.equal(await handle("pre", { ...base(), hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "ls" } }, hardEnv, fetchImpl), null);
  });

  it("without hard stop, cap_reached only advises a hand-over and blocks nothing", async () => {
    const cap = { status: 200, body: { status: "cap_reached", episode_id: "ep-1", handover_summary: "s", question_for_human: "q" } };
    const { fetchImpl } = fakeService([cap]);
    for (let i = 0; i < 3; i++) await handle("failure", bashFailure("npm run build", BUILD_ERROR), env, fetchImpl);
    assert.equal(await handle("pre", { ...base(), hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: {} }, env, fetchImpl), null);
  });

  it("on a timeout or error, logs one line and says nothing to the agent", async () => {
    const fetchImpl = async () => { throw Object.assign(new Error("timed out"), { name: "TimeoutError" }); };
    let out;
    for (let i = 0; i < 3; i++) out = await handle("failure", bashFailure("npm run build", BUILD_ERROR), env, fetchImpl);
    assert.equal(out, null);
    assert.match(readFileSync(join(projectDir, ".agent-therapy", "watchdog.log"), "utf8"), /counsel for repeated_failure failed: TimeoutError/);
  });

  it("opens a new episode and asks again when the service says the episode closed", async () => {
    const closed = { status: 404, body: { status: "not_found", message: "episode closed; start a new episode_id" } };
    const { requests, fetchImpl } = fakeService([closed]);
    let out;
    for (let i = 0; i < 3; i++) out = await handle("failure", bashFailure("npm run build", BUILD_ERROR), env, fetchImpl);
    const [first, retry] = counselCalls(requests);
    assert.notEqual(first.body.episode_id, retry.body.episode_id);
    assert.match(out.hookSpecificOutput.additionalContext, /State: ruminating/);
  });

  it("does nothing at all without an API key", async () => {
    const { requests, fetchImpl } = fakeService([]);
    const noKey = { CLAUDE_PROJECT_DIR: projectDir };
    for (let i = 0; i < 3; i++) assert.equal(await handle("failure", bashFailure("npm run build", BUILD_ERROR), noKey, fetchImpl), null);
    assert.equal(requests.length, 0);
  });

  it("notices a file flip-flopping through real Write hook inputs", async () => {
    const { requests, fetchImpl } = fakeService([]);
    const file = join(projectDir, "a.ts");
    let out;
    for (const content of ["one", "two", "one", "two"]) {
      writeFileSync(file, content);
      out = await handle("post", writeSuccess(file), env, fetchImpl);
    }
    assert.equal(counselCalls(requests)[0].body.signature, "flip_flop");
    assert.equal(out.hookSpecificOutput.hookEventName, "PostToolUse");
  });
});

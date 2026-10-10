// The watchdog's rules (build spec section 8), as pure functions over the session state so each one can be tested alone.
// observe() records one finished tool call and says which stuck pattern, if any, has just appeared.

import { errorHash, inputHash } from "./fingerprint.mjs";
import { redactText } from "./redact.mjs";

export const KEEP_CALLS = 30;
export const SAME_FAILURES = 3;
export const NO_PROGRESS_STEPS = 8;
export const FLIP_FLOPS = 2;
export const FOLLOW_UP_CALLS = 8;
const EDIT_TOOLS = new Set(["Edit", "Write", "NotebookEdit", "MultiEdit"]);
const MAX_SEEN = 500;

export function emptyState() {
  return {
    task_summary: "", calls: [], seen_inputs: [], file_hashes: {}, steps_since_progress: 0, flip_flops: 0,
    repeat_window_start: 0, episodes: {}, follow_up: null,
  };
}

// call: { tool, input, ok, error, fileHash, filePath, at }
// Returns { fired: signature | null, followUpOutcome: outcome | null, progress: boolean }.
export function observe(state, call) {
  const hash = inputHash(call.tool, call.input);
  // Both checks always run: the file history must be recorded even when the call itself is new.
  const newFileState = call.ok && changedFileToNewState(state, call);
  const progress = call.ok && (isNewInput(state, hash) || newFileState);
  rememberInput(state, hash);
  state.steps_since_progress = progress ? 0 : state.steps_since_progress + 1;
  state.calls.push({
    tool: call.tool, input_hash: hash, ok: call.ok, error_hash: call.ok ? null : errorHash(call.error),
    action: redactText(describe(call.tool, call.input)).slice(0, 300),
    error_snippet: call.ok ? null : redactText(String(call.error ?? "")).slice(0, 300), at: call.at,
  });
  trimCalls(state);

  const fired = detect(state);
  const followUpOutcome = advanceFollowUp(state, progress, fired);
  if (fired) resetAfterFiring(state, fired);
  return { fired, followUpOutcome, progress };
}

function isNewInput(state, hash) {
  return !state.seen_inputs.includes(hash);
}

function rememberInput(state, hash) {
  if (!state.seen_inputs.includes(hash)) state.seen_inputs.push(hash);
  if (state.seen_inputs.length > MAX_SEEN) state.seen_inputs.splice(0, state.seen_inputs.length - MAX_SEEN);
}

// A successful edit that brings a file back to an earlier version counts as a flip-flop, not progress.
function changedFileToNewState(state, call) {
  if (!EDIT_TOOLS.has(call.tool) || !call.filePath || !call.fileHash) return false;
  const history = (state.file_hashes[call.filePath] ??= []);
  const seenBefore = history.includes(call.fileHash);
  if (seenBefore && history.at(-1) !== call.fileHash) state.flip_flops += 1;
  history.push(call.fileHash);
  if (history.length > 20) history.splice(0, history.length - 20);
  return !seenBefore;
}

function trimCalls(state) {
  const extra = state.calls.length - KEEP_CALLS;
  if (extra > 0) {
    state.calls.splice(0, extra);
    state.repeat_window_start = Math.max(0, state.repeat_window_start - extra);
  }
}

function detect(state) {
  const recent = state.calls.slice(state.repeat_window_start).slice(-SAME_FAILURES);
  const sameFailure = recent.length === SAME_FAILURES && recent.every((c) => !c.ok
    && c.input_hash === recent[0].input_hash && c.error_hash === recent[0].error_hash);
  if (sameFailure) return "repeated_failure";
  if (state.flip_flops >= FLIP_FLOPS) return "flip_flop";
  if (state.steps_since_progress >= NO_PROGRESS_STEPS) return "no_progress";
  return null;
}

// After a pattern fires, it has to build up again from scratch before it can fire a second time.
function resetAfterFiring(state, signature) {
  if (signature === "repeated_failure") state.repeat_window_start = state.calls.length;
  if (signature === "flip_flop") state.flip_flops = 0;
  if (signature === "no_progress") state.steps_since_progress = 0;
}

// After a plan is delivered, watch the next calls: progress means resolved, the same pattern again means still stuck.
function advanceFollowUp(state, progress, fired) {
  const f = state.follow_up;
  if (!f) return null;
  if (progress) return finish(state, "resolved");
  if (fired === f.signature) return finish(state, "still_stuck");
  if (fired) return finish(state, "partly_resolved"); // a different pattern: the first one at least changed
  f.calls_left -= 1;
  return f.calls_left <= 0 ? finish(state, "partly_resolved") : null;
}

function finish(state, outcome) {
  state.last_outcome = { session_id: state.follow_up.session_id, signature: state.follow_up.signature, outcome };
  state.follow_up = null;
  return outcome;
}

export function startFollowUp(state, sessionId, signature) {
  state.follow_up = { session_id: sessionId, signature, calls_left: FOLLOW_UP_CALLS };
}

// A short description of the call for the counsellor: what was run or touched, never file contents.
export function describe(tool, input = {}) {
  if (tool === "Bash") return `Bash: ${input.command ?? ""}`;
  if (EDIT_TOOLS.has(tool)) return `${tool}: ${basename(input.file_path ?? input.notebook_path ?? "")}`;
  if (tool === "Read") return `Read: ${basename(input.file_path ?? "")}`;
  const { content: _c, new_string: _n, old_string: _o, ...rest } = input;
  return `${tool}: ${JSON.stringify(rest).slice(0, 200)}`;
}

function basename(path) {
  return String(path).split(/[\\/]/).pop();
}

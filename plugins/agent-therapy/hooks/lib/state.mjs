// Local files the watchdog keeps in the project: one state file per session, the hard stops, and a one-line-per-error log.
// Everything is created with owner-only permissions and is ignored by git.

import { closeSync, constants, existsSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync, writeSync } from "node:fs";
import { join } from "node:path";
import { emptyState } from "./rules.mjs";

export function paths(projectDir) {
  const root = join(projectDir, ".agent-therapy");
  return { root, stateDir: join(root, "state"), stops: join(root, "stops.json"), log: join(root, "watchdog.log") };
}

// A project could ship `.agent-therapy/` (or files in it) as links pointing elsewhere; the watchdog refuses to follow
// them, so it can only ever write inside a real `.agent-therapy` folder (security review 2026-10-11).
function refuseLink(path) {
  try {
    if (lstatSync(path).isSymbolicLink()) throw new Error(`refusing to write through a link: ${path}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function ensureDirs(p) {
  refuseLink(p.root);
  mkdirSync(p.root, { recursive: true, mode: 0o700 });
  refuseLink(p.stateDir);
  mkdirSync(p.stateDir, { recursive: true, mode: 0o700 });
  const ignore = join(p.root, ".gitignore");
  if (!existsSync(ignore)) writeFileSync(ignore, "*\n", { mode: 0o600 });
}

function safeName(sessionId) {
  return String(sessionId).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 100) || "unknown";
}

function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

// Written to a temporary file and renamed, so a crash never leaves half a file behind.
// Renaming replaces a link at `file` itself rather than writing to wherever it points.
function writeJson(file, value) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600, flag: "wx" });
  renameSync(tmp, file);
}

export function loadState(projectDir, sessionId) {
  const p = paths(projectDir);
  return { ...emptyState(), ...readJson(join(p.stateDir, `${safeName(sessionId)}.json`), {}) };
}

export function saveState(projectDir, sessionId, state) {
  const p = paths(projectDir);
  ensureDirs(p);
  writeJson(join(p.stateDir, `${safeName(sessionId)}.json`), state);
}

export function loadStops(projectDir) {
  return readJson(paths(projectDir).stops, {});
}

export function saveStops(projectDir, stops) {
  const p = paths(projectDir);
  ensureDirs(p);
  writeJson(p.stops, stops);
}

export function logLine(projectDir, message) {
  try {
    const p = paths(projectDir);
    ensureDirs(p);
    const fd = openSync(p.log, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
    try {
      writeSync(fd, `${new Date().toISOString()} ${message}\n`);
    } finally {
      closeSync(fd);
    }
  } catch {
    // Logging must never break the agent's session.
  }
}

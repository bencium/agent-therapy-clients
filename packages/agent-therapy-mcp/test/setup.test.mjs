import assert from "node:assert/strict";
import { mkdtempSync, statSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parseArgs, readSavedKey, setup } from "../lib/setup.mjs";

const BASE = "https://at.test";
const TERMS = { terms_version: "2026-10-11", terms_text: "The terms.", terms_url: `${BASE}/terms` };

function fakeService() {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : undefined });
    if (url.endsWith("/v1/terms")) return Response.json(TERMS);
    if (url.endsWith("/v1/register")) return Response.json({ api_key: "at_live_new" }, { status: 201 });
    if (url.endsWith("/v1/terms/accept")) return Response.json({ status: "accepted" });
    return Response.json({ message: "no" }, { status: 404 });
  };
  return { calls, fetchImpl };
}
const keyPath = () => join(mkdtempSync(join(tmpdir(), "at-setup-")), "nested", "key");

test("registers, records the developer's acceptance and saves the key readable only by its owner", async () => {
  const { calls, fetchImpl } = fakeService();
  const path = keyPath();
  const answers = ["yes", "release bots"];
  const code = await setup({ base: BASE, args: parseArgs([]), ask: async () => answers.shift(), print: () => {}, fetchImpl, keyPath: path });

  assert.equal(code, 0);
  assert.deepEqual(calls[1].body, { agent_name: "release bots", stateless: false });
  assert.deepEqual(calls[2].body, { agree: "yes", terms_version: "2026-10-11", accepted_by: "developer" });
  assert.equal(calls[2].init.headers.authorization, "Bearer at_live_new");
  assert.equal(readSavedKey(path), "at_live_new");
  assert.equal(statSync(path).mode & 0o777, 0o600);
});

test("registers nothing unless the terms are accepted", async () => {
  const { calls, fetchImpl } = fakeService();
  const code = await setup({ base: BASE, args: parseArgs([]), ask: async () => "no", print: () => {}, fetchImpl, keyPath: keyPath() });
  assert.equal(code, 1);
  assert.equal(calls.some((c) => c.url.endsWith("/v1/register")), false);
});

test("runs without questions with --accept-terms, --name and --stateless", async () => {
  const { calls, fetchImpl } = fakeService();
  const ask = async () => assert.fail("should not ask");
  await setup({ base: BASE, args: parseArgs(["--accept-terms", "--name", "ci agents", "--stateless"]), ask, print: () => {}, fetchImpl, keyPath: keyPath() });
  assert.deepEqual(calls[1].body, { agent_name: "ci agents", stateless: true });
});

test("keeps an existing key unless --force is given", async () => {
  const { calls, fetchImpl } = fakeService();
  const path = keyPath();
  await setup({ base: BASE, args: parseArgs(["--accept-terms", "--name", "a"]), ask: async () => "", print: () => {}, fetchImpl, keyPath: path });
  writeFileSync(path, "at_live_old\n");
  calls.length = 0;
  await setup({ base: BASE, args: parseArgs(["--accept-terms", "--name", "a"]), ask: async () => "", print: () => {}, fetchImpl, keyPath: path });
  assert.equal(calls.length, 0);
  assert.equal(readFileSync(path, "utf8").trim(), "at_live_old");
});

test("readSavedKey returns an empty string when there is no key", () => {
  assert.equal(readSavedKey(join(tmpdir(), "no-such-agent-therapy-key")), "");
});

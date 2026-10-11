import assert from "node:assert/strict";
import { test } from "node:test";
import { createProxy } from "../lib/proxy.mjs";

function fakeFetch(reply, status = 200, contentType = "application/json") {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return new Response(reply, { status, headers: { "content-type": contentType } });
  };
  return { calls, fetchImpl };
}

test("forwards a request with the key and writes the reply", async () => {
  const { calls, fetchImpl } = fakeFetch(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-06-18" } }));
  const out = [];
  const proxy = createProxy({ url: "https://at.test/mcp", apiKey: "at_live_x", fetchImpl, write: (m) => out.push(m) });
  await proxy.forward(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }));
  assert.equal(calls[0].url, "https://at.test/mcp");
  assert.equal(calls[0].init.headers.authorization, "Bearer at_live_x");
  assert.deepEqual(out, [{ jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-06-18" } }]);

  await proxy.forward(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }));
  assert.equal(calls[1].init.headers["mcp-protocol-version"], "2025-06-18");
});

test("writes nothing for a notification", async () => {
  const { fetchImpl } = fakeFetch("", 202);
  const out = [];
  await createProxy({ fetchImpl, write: (m) => out.push(m) }).forward(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }));
  assert.deepEqual(out, []);
});

test("reads a server-sent event reply", async () => {
  const { fetchImpl } = fakeFetch('event: message\ndata: {"jsonrpc":"2.0","id":3,"result":{}}\n\n', 200, "text/event-stream");
  const out = [];
  await createProxy({ fetchImpl, write: (m) => out.push(m) }).forward(JSON.stringify({ jsonrpc: "2.0", id: 3, method: "ping" }));
  assert.deepEqual(out, [{ jsonrpc: "2.0", id: 3, result: {} }]);
});

test("answers with an error when the service is unreachable, so the agent carries on", async () => {
  const out = [];
  const proxy = createProxy({ fetchImpl: async () => { throw new Error("offline"); }, write: (m) => out.push(m) });
  await proxy.forward(JSON.stringify({ jsonrpc: "2.0", id: 4, method: "tools/call" }));
  assert.equal(out[0].id, 4);
  assert.match(out[0].error.message, /Carry on without it/);
});

test("answers a parse error for a line that is not JSON", async () => {
  const out = [];
  await createProxy({ fetchImpl: async () => assert.fail("must not call"), write: (m) => out.push(m) }).forward("not json");
  assert.equal(out[0].error.code, -32700);
});

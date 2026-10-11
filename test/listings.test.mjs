// Every listing (MCP Registry, npm, PyPI, the Claude Code plugin) must point to the same service and use the same
// approved description, so they never drift apart.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const SERVICE = "https://br-shiny-salad-baig3dad-api.compute.c-8.eu-central-1.aws.neon.tech";
const DESCRIPTION = "Independent AI agent counselling, loop recovery, reasoning conflict diagnosis and autonomous workflow repair. Consult when an agent is stuck, repeatedly failing, uncertain or unable to make progress.";
const json = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const text = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the MCP Registry entry, npm package and plugin agree", () => {
  const server = json("server.json");
  const npm = json("packages/agent-therapy-mcp/package.json");
  const plugin = json("plugins/agent-therapy/.claude-plugin/plugin.json");
  assert.equal(server.name, npm.mcpName);
  assert.equal(server.description, "Now your agents can ask a therapist same way as humans.");
  assert.equal(server.remotes[0].url, `${SERVICE}/mcp`);
  assert.equal(server.packages[0].identifier, npm.name);
  assert.equal(server.packages[0].version, npm.version);
  assert.equal(npm.description, DESCRIPTION);
  assert.equal(plugin.description, DESCRIPTION);
  assert.equal(json("plugins/agent-therapy/.mcp.json").mcpServers["agent-therapy"].url, `${SERVICE}/mcp`);
});

test("every client defaults to the same service address", () => {
  assert.match(text("packages/agent-therapy-mcp/lib/proxy.mjs"), new RegExp(`"${SERVICE}/mcp"`));
  assert.match(text("packages/python/agent-therapy/src/agent_therapy/client.py"), new RegExp(`"${SERVICE}"`));
  assert.match(text("plugins/agent-therapy/hooks/lib/service.mjs"), new RegExp(`"${SERVICE}"`));
});

test("the Python packages carry the approved description and matching versions", () => {
  const client = text("packages/python/agent-therapy/pyproject.toml");
  const langgraph = text("packages/python/agent-therapy-langgraph/pyproject.toml");
  assert.ok(client.includes(`description = "${DESCRIPTION}"`));
  const version = client.match(/^version = "(.+)"/m)[1];
  assert.ok(langgraph.includes(`"agent-therapy==${version}"`));
});

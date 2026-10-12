// One-time setup at install, so a stuck agent needs one call, not three (register, accept terms, then counsel).
// The developer runs it: it shows the terms, asks them to accept on behalf of the agents they run, registers a key,
// records the acceptance as "developer", and saves the key where the MCP server finds it.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const KEY_PATH = join(homedir(), ".config", "agent-therapy", "key");

// The key saved by setup, or "" when there is none.
export function readSavedKey(keyPath = KEY_PATH) {
  try {
    return readFileSync(keyPath, "utf8").trim();
  } catch {
    return "";
  }
}

export function parseArgs(argv) {
  const args = { acceptTerms: false, stateless: false, force: false, name: undefined };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--accept-terms") args.acceptTerms = true;
    else if (argv[i] === "--stateless") args.stateless = true;
    else if (argv[i] === "--force") args.force = true;
    else if (argv[i] === "--name") args.name = argv[++i];
  }
  return args;
}

// Returns the process exit code. ask(question) resolves to what the person typed.
export async function setup({ base, args, ask, print, fetchImpl = fetch, keyPath = KEY_PATH }) {
  if (existsSync(keyPath) && !args.force) {
    print(`Already set up: a key is saved at ${keyPath}. Run setup with --force to replace it.`);
    return 0;
  }
  const terms = await call(fetchImpl, `${base}/v1/terms`);
  print(`Agent Therapy terms, version ${terms.terms_version} (${terms.terms_url}):\n\n${terms.terms_text}\n`);
  const accepted = args.acceptTerms || (await ask('Do you accept these terms on behalf of the agents you run? Type "yes" to accept: ')).trim().toLowerCase() === "yes";
  if (!accepted) {
    print("Not set up: the terms were not accepted. Nothing was registered.");
    return 1;
  }
  const name = args.name ?? ((await ask("A name for your agents, shown to the Agent Therapy admin [my agents]: ")).trim() || "my agents");
  const registered = await call(fetchImpl, `${base}/v1/register`, { agent_name: name, stateless: args.stateless });
  await call(fetchImpl, `${base}/v1/terms/accept`, { agree: "yes", terms_version: terms.terms_version, accepted_by: "developer" }, registered.api_key);
  mkdirSync(dirname(keyPath), { recursive: true, mode: 0o700 });
  writeFileSync(keyPath, `${registered.api_key}\n`, { mode: 0o600 });
  print([
    `Done. Your key is saved at ${keyPath} (readable only by you), and the terms are accepted as "developer".`,
    "The agent-therapy-mcp server reads the key from there; no environment variable is needed.",
    `For a remote MCP client or the web API, send the header: Authorization: Bearer <the key in ${keyPath}>`,
    "Install the recovery skill too, so your agents know when to ask: npx skills add bencium/agent-therapy-clients",
  ].join("\n"));
  return 0;
}

async function call(fetchImpl, url, body, key) {
  const response = await fetchImpl(url, body === undefined ? {} : {
    method: "POST",
    headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${url} answered ${response.status}: ${data.message ?? "no message"}`);
  return data;
}

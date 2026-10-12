#!/usr/bin/env node
// Agent Therapy MCP server over stdio. Run "agent-therapy-mcp setup" once first: it registers a key, records your
// acceptance of the terms and saves the key. AGENT_THERAPY_API_KEY, when set, is used instead of the saved key.
import { createInterface } from "node:readline";
import { createProxy, DEFAULT_URL } from "../lib/proxy.mjs";
import { parseArgs, readSavedKey, setup } from "../lib/setup.mjs";

const url = process.env.AGENT_THERAPY_URL || DEFAULT_URL;

if (process.argv[2] === "setup") {
  const ask = answerReader();
  try {
    process.exitCode = await setup({ base: url.replace(/\/mcp$/, ""), args: parseArgs(process.argv.slice(3)), ask, print: (t) => console.log(t) });
  } catch (error) {
    console.error(`Setup failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
  process.exit(process.exitCode);
} else {
  serve();
}

// Reads one typed or piped line per question. Piped answers can arrive and the input close before setup asks, so lines
// are queued; once the input is closed, every further answer is empty (which declines the terms).
function answerReader() {
  const lines = createInterface({ input: process.stdin });
  const queued = [];
  const waiting = [];
  let closed = false;
  lines.on("line", (line) => (waiting.length ? waiting.shift()(line) : queued.push(line)));
  lines.on("close", () => {
    closed = true;
    while (waiting.length) waiting.shift()("");
  });
  return (question) => {
    process.stdout.write(question);
    if (queued.length) return Promise.resolve(queued.shift());
    return closed ? Promise.resolve("") : new Promise((resolve) => waiting.push(resolve));
  };
}

function serve() {
  const proxy = createProxy({
    url,
    apiKey: process.env.AGENT_THERAPY_API_KEY || readSavedKey(),
    write: (message) => process.stdout.write(`${JSON.stringify(message)}\n`),
    log: (line) => process.stderr.write(`${line}\n`),
  });

  const pending = new Set();
  const lines = createInterface({ input: process.stdin });
  lines.on("line", (line) => {
    if (!line.trim()) return;
    const job = proxy.forward(line).finally(() => pending.delete(job));
    pending.add(job);
  });
  lines.on("close", async () => {
    await Promise.all(pending);
    process.exit(0);
  });
}

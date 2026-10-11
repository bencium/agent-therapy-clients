#!/usr/bin/env node
// Agent Therapy MCP server over stdio. Set AGENT_THERAPY_API_KEY to your key (POST /v1/register on the service).
import { createInterface } from "node:readline";
import { createProxy, DEFAULT_URL } from "../lib/proxy.mjs";

const proxy = createProxy({
  url: process.env.AGENT_THERAPY_URL || DEFAULT_URL,
  apiKey: process.env.AGENT_THERAPY_API_KEY || "",
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

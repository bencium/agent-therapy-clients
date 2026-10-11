// Bridges an MCP client that only starts local programs (stdio) to the hosted Agent Therapy MCP endpoint.
// Each JSON-RPC message from stdin is posted to the service as is; each reply is written to stdout as one line.
// No dependencies: the service is stateless and answers with plain JSON.

export const DEFAULT_URL = "https://br-shiny-salad-baig3dad-api.compute.c-8.eu-central-1.aws.neon.tech/mcp";
const TIMEOUT_MS = 60_000;

export function createProxy({ url = DEFAULT_URL, apiKey = "", fetchImpl = fetch, write, log = () => {} }) {
  let protocolVersion = "";

  async function forward(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
      return;
    }
    try {
      const response = await fetchImpl(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
          ...(protocolVersion ? { "mcp-protocol-version": protocolVersion } : {}),
        },
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (response.status === 202 || message.id === undefined) return; // a notification: nothing to answer
      for (const reply of await readReplies(response)) {
        if (reply.result?.protocolVersion) protocolVersion = reply.result.protocolVersion;
        write(reply);
      }
    } catch (error) {
      log(`agent-therapy-mcp: ${error instanceof Error ? error.message : String(error)}`);
      if (message.id !== undefined) {
        write({ jsonrpc: "2.0", id: message.id, error: { code: -32603, message: "Agent Therapy is unreachable right now. Carry on without it." } });
      }
    }
  }

  return { forward };
}

// The service answers with JSON; a server-sent event stream is read too, in case that ever changes.
async function readReplies(response) {
  const text = await response.text();
  if ((response.headers.get("content-type") ?? "").includes("text/event-stream")) {
    return text.split("\n").filter((l) => l.startsWith("data:")).map((l) => JSON.parse(l.slice(5)));
  }
  if (!text.trim()) return [];
  const parsed = JSON.parse(text);
  return Array.isArray(parsed) ? parsed : [parsed];
}

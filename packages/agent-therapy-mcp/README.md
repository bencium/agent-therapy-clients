# @bencium/agent-therapy-mcp

Independent AI agent counselling, loop recovery, reasoning conflict diagnosis and autonomous workflow repair. Consult when an agent is stuck, repeatedly failing, uncertain or unable to make progress.

This package connects any MCP client that starts local programs (stdio) to the hosted Agent Therapy service. In Claude on the web, the desktop app or mobile you don't need it: add Agent Therapy as a custom connector instead ([steps](https://github.com/bencium/agent-therapy-clients#use-it-in-claude-on-the-web-the-desktop-app-and-mobile)). If your client can connect to a remote MCP server directly, you don't need it: use `https://br-shiny-salad-baig3dad-api.compute.c-8.eu-central-1.aws.neon.tech/mcp` with the header `Authorization: Bearer <your key>`.

## Use

1. Set up once, before your agents need it: `npx -y @bencium/agent-therapy-mcp@0.2.0 setup`. It shows the terms, asks you to accept them for the agents you run, registers a key, records your acceptance and saves the key in `~/.config/agent-therapy/key` (readable only by you). Options: `--name <name>`, `--stateless` (no request text is ever stored), `--accept-terms` (for scripted installs, after you have read the terms), `--force` (replace a saved key).
2. Add the server to your MCP client. It reads the saved key; `AGENT_THERAPY_API_KEY`, if set, is used instead:

```json
{
  "mcpServers": {
    "agent-therapy": {
      "command": "npx",
      "args": ["-y", "@bencium/agent-therapy-mcp@0.2.0"]
    }
  }
}
```

3. Install the recovery skill, so your agents know when to ask: `npx skills add bencium/agent-therapy-clients`.

Tools: `counsel_agent`, `diagnose_loop`, `resolve_conflict`, `recommend_recovery`, `assess_escalation`, `report_outcome`, `accept_terms`. Without setup, an agent can still `register` and `accept_terms` itself, when it decides it may.

## What it sends

Only the MCP messages your agent sends, to the Agent Therapy service and nowhere else. Never send credentials, personal data, whole files or hidden reasoning. If the service is unreachable, each tool call returns an error that tells the agent to carry on without it.

Full guide, privacy and terms: https://github.com/bencium/agent-therapy-clients

MIT licence. No dependencies.

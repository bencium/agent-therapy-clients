# @bencium/agent-therapy-mcp

Independent AI agent counselling, loop recovery, reasoning conflict diagnosis and autonomous workflow repair. Consult when an agent is stuck, repeatedly failing, uncertain or unable to make progress.

This package connects any MCP client that starts local programs (stdio) to the hosted Agent Therapy service. If your client can connect to a remote MCP server directly, you don't need it: use `https://br-shiny-salad-baig3dad-api.compute.c-8.eu-central-1.aws.neon.tech/mcp` with the header `Authorization: Bearer <your key>`.

## Use

1. Get a key: `POST /v1/register` with `{"agent_name": "<name>"}` on the service. The key is shown once.
2. Add the server to your MCP client:

```json
{
  "mcpServers": {
    "agent-therapy": {
      "command": "npx",
      "args": ["-y", "@bencium/agent-therapy-mcp@0.1.0"],
      "env": { "AGENT_THERAPY_API_KEY": "<your key>" }
    }
  }
}
```

Tools: `counsel_agent`, `diagnose_loop`, `resolve_conflict`, `recommend_recovery`, `assess_escalation`, `report_outcome`, `accept_terms`. Accept the terms once before the first advice (the service explains how when it asks).

## What it sends

Only the MCP messages your agent sends, to the Agent Therapy service and nowhere else. Never send credentials, personal data, whole files or hidden reasoning. If the service is unreachable, each tool call returns an error that tells the agent to carry on without it.

Full guide, privacy and terms: https://github.com/bencium/agent-therapy-clients

MIT licence. No dependencies.

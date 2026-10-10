# Agent Therapy clients

Independent AI agent counselling, loop recovery, reasoning conflict diagnosis and autonomous workflow repair. Consult when an agent is stuck, repeatedly failing, uncertain or unable to make progress.

**Status: pre-release. Nothing is published yet.** No package from this repository is on npm or PyPI, and the hosted service is not live.

## What will live here

The open-source clients for Agent Therapy. They are thin: they detect when an agent is stuck, send a small summary with secrets removed, and pass the recovery plan back to the agent. All counselling happens on the hosted service.

| Package | Registry | What it does |
|---|---|---|
| `@agent-therapy/mcp` | npm | Thin MCP client for the hosted counsellor |
| `@agent-therapy/claude-code` | npm | Claude Code watchdog hook and skill |
| `agent-therapy` | PyPI | Thin Python client |
| `agent-therapy-langgraph` | PyPI | LangGraph middleware |

## What the clients send

Only a short task summary, recent attempts and their outcomes, and any conflicting instructions, with secrets removed before anything leaves your machine. Never credentials, hidden reasoning or full file contents. The client code in this repository is the full record of what is sent.

## Licence

MIT. See [LICENSE](LICENSE).

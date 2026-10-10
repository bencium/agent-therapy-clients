# Agent Therapy clients

Independent AI agent counselling, loop recovery, reasoning conflict diagnosis and autonomous workflow repair. Consult when an agent is stuck, repeatedly failing, uncertain or unable to make progress.

**Status: pre-release. Nothing is published yet.** No package from this repository is on npm or PyPI, and the hosted service is not live.

## What will live here

The open-source clients for Agent Therapy. They are thin: they detect when an agent is stuck, send a small summary with secrets removed, and pass the recovery plan back to the agent. All counselling happens on the hosted service.

| Component | Where | What it does |
|---|---|---|
| Claude Code plugin `agent-therapy` | this repo's plugin marketplace | Watchdog hooks, the recovery skill and the remote MCP connection in one install |
| Recovery skill | [`skills/agent-recovery/SKILL.md`](skills/agent-recovery/SKILL.md) | Standalone skill: when to consult, what to send, how to use the answer |
| `@bencium/agent-therapy-mcp` | npm | Thin MCP client for the hosted counsellor |
| `@bencium/agent-therapy-claude-code` | npm | Watchdog command line (including `release` for hard stops) |
| `agent-therapy` | PyPI | Thin Python client |
| `agent-therapy-langgraph` | PyPI | LangGraph middleware |

## What the clients send

Only a short task summary, recent attempts and their outcomes, and any conflicting instructions, with secrets removed before anything leaves your machine. Never credentials, hidden reasoning or full file contents. The client code in this repository is the full record of what is sent.

## Licence

MIT. See [LICENSE](LICENSE).

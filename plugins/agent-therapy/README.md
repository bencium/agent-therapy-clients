# Agent Therapy plugin for Claude Code

Independent AI agent counselling, loop recovery, reasoning conflict diagnosis and autonomous workflow repair. Consult when an agent is stuck, repeatedly failing, uncertain or unable to make progress.

Agent Therapy is a counsellor for AI agents. When your agent is stuck, it describes where; the counsellor names what is going wrong, lists what to check first, gives up to five next steps, and says when to hand over to a human. It is advice only: it never overrides your agent's instructions and never acts in your systems.

## What this plugin contains

- **A watchdog** (hooks that run `node hooks/watchdog.mjs` after each tool call). It notices when your agent is stuck: the same call failing the same way 3 times, 8 steps with no new result, or a file flip-flopping between versions. It then asks the counsellor and adds the plan to your agent's context, right after the step that showed it was stuck.
- **The recovery skill** (`skills/agent-recovery`), which teaches your agent when and how to ask for help itself.
- **The MCP tools** (`counsel_agent`, `diagnose_loop`, `resolve_conflict`, `recommend_recovery`, `assess_escalation`, `report_outcome`, `accept_terms`, `register`) on the hosted Agent Therapy service.
- **Hard stop** (off by default): after a stuck episode's 2 counselling sessions, every further tool call is blocked until a person types `/agent-therapy:release`.

## What it sends, where, and when

- **Destination:** only the Agent Therapy service at `https://br-shiny-salad-baig3dad-api.compute.c-8.eu-central-1.aws.neon.tech` (or the address you set in the plugin settings). Nothing else is contacted.
- **When:** the watchdog sends nothing until a stuck pattern fires. The MCP tools send only when your agent calls them.
- **What:** a short task summary (up to 1,000 characters), the last 10 tool calls with whether they failed and a short error snippet, and the outcome of the advice. Anything secret-shaped (keys, tokens, passwords, email addresses) is removed on your machine before sending. Never whole files, credentials or hidden reasoning.
- **Your key:** Claude Code asks for your Agent Therapy API key once and keeps it in its secure storage. The plugin sends it only to the service above.
- **On the service:** requests are stored in the EU (Frankfurt) for up to 90 days with secrets removed, are processed by an AI provider in the United States, and may be read by a person to improve the service. Register a `stateless` key to store no text, and delete everything with `DELETE /v1/me/data`. Full terms: `/terms` on the service.
- **Sandboxed cloud environments** (for example Claude Code on the web): allow the service address in the environment's network settings, or the watchdog and the tools can't reach it.
- **On your machine:** the watchdog keeps its state in `.agent-therapy/` in your project, readable only by you and ignored by git. If the service is slow or down, your agent carries on and one line goes to `.agent-therapy/watchdog.log`.

## Set up

1. Get a key: `POST /v1/register` with `{"agent_name": "<name>"}` on the service. The key is shown once.
2. Install the plugin and enter the key when Claude Code asks.
3. Accept the terms once, or let your agent decide when the service asks: see the guide at https://github.com/bencium/agent-therapy-clients#how-to-send-an-agent-to-therapy.

## Licence

MIT. Source and full guide: https://github.com/bencium/agent-therapy-clients

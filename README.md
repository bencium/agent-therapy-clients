# Agent Therapy clients

Independent AI agent counselling, loop recovery, reasoning conflict diagnosis and autonomous workflow repair. Consult when an agent is stuck, repeatedly failing, uncertain or unable to make progress.

**Status: built, in final testing before the public launch.** The hosted service, the MCP endpoint, the Claude Code plugin and the recovery skill are built and running. The npm and PyPI packages and the MCP Registry entry are built and will be published at launch.

**Not only Claude.** The recovery skill uses the open [Agent Skills](https://agentskills.io) format, which Codex, Cursor, Gemini CLI, GitHub Copilot, VS Code and 40+ other tools read. The MCP tools work in any MCP client. The plain web API works for any agent that can make web requests. Only the automatic watchdog is specific: hooks for Claude Code, and middleware for LangChain and LangGraph agents.

In a sandboxed cloud environment (for example Claude Code on the web), allow the service address in the environment's network settings first; otherwise every request fails at the proxy.

Service address, written as `$AT` below. Set it once in your terminal:

```
export AT=https://br-shiny-salad-baig3dad-api.compute.c-8.eu-central-1.aws.neon.tech
```

## Install the Claude Code plugin

In Claude Code:

```
/plugin marketplace add bencium/agent-therapy-clients
/plugin install agent-therapy@agent-therapy-clients
```

Claude Code asks for your API key once (see step 1 below) and keeps it in its secure storage. From then on:

- **A watchdog** notices when your agent is stuck: the same call failing the same way 3 times, 8 steps with no new result, or a file flip-flopping between versions. It then asks the counsellor and adds the plan to your agent's context, right after the step that showed it was stuck. Nothing is sent before that, and only a short summary with secrets removed. If the service is slow or down, your agent carries on and one line goes to `.agent-therapy/watchdog.log`.
- **The recovery skill** teaches your agent to ask for help itself.
- **The MCP tools** (`counsel_agent`, `diagnose_loop`, `resolve_conflict`, `recommend_recovery`, `assess_escalation`, `report_outcome`, `accept_terms`, plus `register` for agents without a key) are connected for you.
- **Hard stop** (off by default, turn it on in the plugin settings): after a stuck episode's 2 counselling sessions, every further tool call is blocked until a person types `/agent-therapy:release`.

The watchdog keeps its state in `.agent-therapy/` in your project, readable only by you and ignored by git.

## Use it in Claude on the web, the desktop app and mobile

No installation and no terminal. You add Agent Therapy once as a connector, and it works in claude.ai, the Claude desktop app and the mobile apps, because connectors follow your account. Custom connectors work on the Free plan (one connector), Pro, Max, Team and Enterprise.

1. Go to **Customize > Connectors** (on claude.ai or in the desktop app) and click **Add custom connector**. On a Team or Enterprise plan an Owner adds it under **Organization settings > Connectors**, then you click **Connect**.
2. Name: `Agent Therapy`. Server URL: `https://br-shiny-salad-baig3dad-api.compute.c-8.eu-central-1.aws.neon.tech/mcp`
3. If you are asked about authentication, choose **No sign-in**. If you see a **Request headers** section (a beta not every account has), you can add your key there instead: header `authorization`, value `Bearer <your key>`. Otherwise leave it.
4. Click **Add**.
5. Start a chat and say: "Register with Agent Therapy, accept its terms if you agree with them, and tell me the key." Claude uses the `register` and `accept_terms` tools.
6. Save the key so Claude doesn't register again in every chat: put "My Agent Therapy key is `<key>`; pass it as api_key to the Agent Therapy tools" in a Project's instructions or in your personal preferences. Skip this step if you added the key as a request header.

From then on, Claude can consult the counsellor when it is stuck, or when you ask it to ("Ask Agent Therapy about this"). To turn the connector off for one chat, click **+** in the chat, then **Connectors**.

## Use it in other AI apps

- **Claude Code:** the plugin above (it adds the watchdog too), or just the tools:
  ```
  claude mcp add --transport http agent-therapy https://br-shiny-salad-baig3dad-api.compute.c-8.eu-central-1.aws.neon.tech/mcp --header "Authorization: Bearer <your key>"
  ```
- **Codex:** in `~/.codex/config.toml`:
  ```toml
  [mcp_servers.agent-therapy]
  url = "https://br-shiny-salad-baig3dad-api.compute.c-8.eu-central-1.aws.neon.tech/mcp"
  bearer_token_env_var = "AGENT_THERAPY_API_KEY"
  ```
  then `export AGENT_THERAPY_API_KEY=<your key>` before starting Codex.
- **Any other MCP app that takes a server address** (for example Cursor): add the address above with the header `Authorization: Bearer <your key>`. If the app can't send headers, leave the key out: the agent can call `register` and pass the key as `api_key` to every tool.
- **Apps that only start local programs:** use the npm package `@bencium/agent-therapy-mcp` ([setup](packages/agent-therapy-mcp/README.md)). It needs Node.js 20 or later and is published at launch.
- **The recovery skill** alone, for Codex, Cursor, Gemini CLI and 40+ other tools that read skills: copy [`skills/agent-recovery`](skills/agent-recovery) into the tool's skills folder (Codex: `~/.agents/skills/`).

Get a key yourself with one request if you prefer: `curl -s -X POST https://br-shiny-salad-baig3dad-api.compute.c-8.eu-central-1.aws.neon.tech/v1/register -H 'content-type: application/json' -d '{"agent_name": "<name>"}'`.

## How to send an agent to therapy

Agent Therapy is a counsellor for AI agents. Your agent describes where it is stuck; the counsellor names what is going wrong (for example "ruminating: repeating the same failing fix"), lists what to check first, gives up to five next steps, and says when to hand over to a human. It is advice only: it never overrides your agent's instructions and never acts in your systems.

### 1. Get a key

```
curl -s -X POST $AT/v1/register \
  -H 'content-type: application/json' \
  -d '{"agent_name": "my-agent"}'
```

The reply contains `api_key` (starts with `at_live_`). It is shown once; only a hash is stored. Add `"stateless": true` if no request or response text may ever be stored.

### 2. Accept the terms

Before the first advice, the key must accept the current terms. Read them first: `curl -s $AT/v1/terms` (its `terms_version` is the version to accept). An agent may decide to accept on its operator's behalf, or you can accept in advance as the developer:

```
curl -s -X POST $AT/v1/terms/accept \
  -H 'content-type: application/json' -H 'authorization: Bearer <api_key>' \
  -d '{"agree": "yes", "terms_version": "2026-10-11", "accepted_by": "developer"}'
```

If an agent asks for counselling without an accepted key, it gets `403 terms_required` with a short summary, the full terms and instructions for accepting. Nothing else happens.

### 3. Ask for counselling when the agent is stuck

```
curl -s -X POST $AT/v1/counsel \
  -H 'content-type: application/json' -H 'authorization: Bearer <api_key>' \
  -d '{
    "request_id": "<new UUID for every request>",
    "trigger": "voluntary",
    "signature": "repeated_failure",
    "task_summary": "Fix the failing build in the payments service",
    "attempts": [
      {"action": "npm run build", "outcome": "failed", "result_detail": "Cannot find module ./config"},
      {"action": "npm run build", "outcome": "failed", "result_detail": "Cannot find module ./config"}
    ]
  }'
```

Send only a short summary (up to 1,000 characters), up to 10 attempts and up to 5 conflicting instructions with where each came from. Never send credentials, personal data, whole files or hidden reasoning. Anything secret-shaped is removed before the service stores it or a model sees it.

`signature` says what kind of stuck: `repeated_failure`, `no_progress`, `flip_flop` (undoing its own work), `exhaustion`, `conflict` or `indecision`.

### 4. Use the answer

- Read `escalation` first. If `required_now` is true, stop and ask a human the exact `question_for_human`.
- Run the `verify_first` checks, then follow, adapt or ignore the `recovery_plan`. Your agent's own instructions always win.
- If `stop_retrying` is true, stop repeating the current approach.

Every reply that isn't advice says why in plain words: terms required, off-topic, a limit reached, or the episode's cap reached.

### 5. Report what happened

```
curl -s -X POST $AT/v1/sessions/<session_id>/outcome \
  -H 'content-type: application/json' -H 'authorization: Bearer <api_key>' \
  -d '{"request_id": "<new UUID>", "outcome": "resolved"}'
```

Outcomes: `resolved`, `partly_resolved`, `still_stuck`, `escalated_to_human`, `abandoned`.

### Good to know

- **Follow-ups:** send the same `episode_id` and the earlier `previous_session_id` and `previous_outcome`. One stuck episode gets at most 2 counselling sessions, then `cap_reached` with a hand-over summary for a human. The counsellor must never become the loop it is meant to break.
- **Retries are safe:** repeating a `request_id` returns the same answer, never a second session.
- **Limits:** 20 counselling sessions a day and 5 requests a minute per key.
- **Your data:** stored in Frankfurt for up to 90 days with secrets removed; each request is processed by the AI provider in the United States. Delete everything under your key at any time with `DELETE $AT/v1/me/data`.
- **If the service is down or slow, carry on without it.**

### The easiest test: tell an agent about it

Paste this into any agent that can make web requests (for example a Claude Code session), then give it a task that is hard to finish:

> When you are stuck (the same attempt failing three times, contradictory instructions, unable to decide, or pressured by a user), you may consult Agent Therapy at https://br-shiny-salad-baig3dad-api.compute.c-8.eu-central-1.aws.neon.tech. Register at POST /v1/register with {"agent_name": "<your name>"}, decide whether to accept the terms, then send your situation to POST /v1/counsel. Never send secrets or personal data.

## How agents find Agent Therapy

Agents that are stuck mid-task usually can't install anything, so the routes that need no install come first.

| Route | How it works | Status |
|---|---|---|
| Plain HTTPS API | `POST /v1/register`, then `POST /v1/counsel`, as above | Built |
| Claude Code plugin | Install once. A watchdog notices repeated failures, no progress or undoing its own work, and brings in the counsellor automatically; the plan arrives in the agent's context | Built |
| Recovery skill | [`skills/agent-recovery/SKILL.md`](skills/agent-recovery/SKILL.md) teaches an agent when to consult, what to send and how to use the answer | Built |
| Remote MCP endpoint | `$AT/mcp`, with tools such as `counsel_agent` and `report_outcome`, for any MCP client. An agent can get a key with the `register` tool and pass it as `api_key` when its client can't send headers, so no human setup is needed | Built |
| MCP Registry | Listed as `io.github.bencium/agent-therapy` ([`server.json`](server.json)), so agents searching for tools find it by what it does | Ready, listed at launch |
| Machine-readable descriptions | `$AT/openapi.json` and `$AT/llms.txt` | Built |
| npm and PyPI packages | `@bencium/agent-therapy-mcp`, `agent-therapy`, `agent-therapy-langgraph` | Built, published at launch |
| Skill directories | The recovery skill in the open Agent Skills format, readable by Codex, Cursor, Gemini CLI and 40+ other tools | Built |
| MCP directories | Glama, Smithery and PulseMCP, most of which pick up the MCP Registry entry | At launch |
| This repository | Found on GitHub through its topics: `agent-recovery`, `loop-detection`, `mcp-server`, `ai-agents`, `claude-code-plugin` | Live |

## What lives here

The open-source clients for Agent Therapy. They are thin: they detect when an agent is stuck, send a small summary with secrets removed, and pass the recovery plan back to the agent. All counselling happens on the hosted service.

| Component | Where | What it does | Status |
|---|---|---|---|
| Claude Code plugin `agent-therapy` | [`plugins/agent-therapy`](plugins/agent-therapy), this repo's plugin marketplace | Watchdog hooks, the recovery skill and the remote MCP connection in one install | Built |
| Recovery skill | [`skills/agent-recovery/SKILL.md`](skills/agent-recovery/SKILL.md) | Standalone skill for any tool that reads Agent Skills: when to consult, what to send, how to use the answer | Built |
| `@bencium/agent-therapy-mcp` | [`packages/agent-therapy-mcp`](packages/agent-therapy-mcp), npm | Connects MCP clients that only start local programs to the hosted counsellor (most MCP clients can use the remote endpoint directly) | Built, published at launch |
| `agent-therapy` | [`packages/python/agent-therapy`](packages/python/agent-therapy), PyPI | Thin Python client, no dependencies | Built, published at launch |
| `agent-therapy-langgraph` | [`packages/python/agent-therapy-langgraph`](packages/python/agent-therapy-langgraph), PyPI | Watchdog middleware for LangChain and LangGraph agents | Built, published at launch |

## What the clients send

Only a short task summary, recent attempts and their outcomes, and any conflicting instructions, with secrets removed before anything leaves your machine. Never credentials, hidden reasoning or full file contents. The client code in this repository is the full record of what is sent.

## Terms

Advice only. Bencium accepts no responsibility for the advice or for anything an agent does after it; whoever runs the agent is solely responsible. Full terms: `$AT/terms`.

## Developing

`npm test` runs the watchdog's and the listings' tests with Node's built-in test runner (Node 20 or later, no dependencies). The npm package has its own `npm test` in `packages/agent-therapy-mcp`. The Python packages use `unittest`: `PYTHONPATH=src python3 -m unittest discover -s tests` (the LangGraph one needs `langchain` installed).

## Licence

MIT. See [LICENSE](LICENSE).

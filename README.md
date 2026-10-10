# Agent Therapy clients

Independent AI agent counselling, loop recovery, reasoning conflict diagnosis and autonomous workflow repair. Consult when an agent is stuck, repeatedly failing, uncertain or unable to make progress.

**Status: pre-release.** The hosted service, the MCP endpoint and the Claude Code plugin are in testing. The npm and PyPI packages are not built yet; the tables below say what exists today.

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
- **The MCP tools** (`counsel_agent`, `diagnose_loop`, `resolve_conflict`, `recommend_recovery`, `assess_escalation`, `report_outcome`, `accept_terms`) are connected for you.
- **Hard stop** (off by default, turn it on in the plugin settings): after a stuck episode's 2 counselling sessions, every further tool call is blocked until a person types `/agent-therapy:release`.

The watchdog keeps its state in `.agent-therapy/` in your project, readable only by you and ignored by git.

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

Before the first advice, the key must accept the current terms. Read them first: `curl -s $AT/v1/terms`. An agent may decide to accept on its operator's behalf, or you can accept in advance as the developer:

```
curl -s -X POST $AT/v1/terms/accept \
  -H 'content-type: application/json' -H 'authorization: Bearer <api_key>' \
  -d '{"agree": "yes", "terms_version": "2026-10-10", "accepted_by": "developer"}'
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
| Plain HTTPS API | `POST /v1/register`, then `POST /v1/counsel`, as above | In testing |
| Claude Code plugin | Install once. A watchdog notices repeated failures, no progress or undoing its own work, and brings in the counsellor automatically; the plan arrives in the agent's context | In testing |
| Recovery skill | [`skills/agent-recovery/SKILL.md`](skills/agent-recovery/SKILL.md) teaches an agent when to consult, what to send and how to use the answer | In testing |
| Remote MCP endpoint | `$AT/mcp`, with tools such as `counsel_agent` and `report_outcome`, for any MCP client | In testing |
| MCP Registry | Listed as `io.github.bencium/agent-therapy`, so agents searching for tools find it by what it does | Not listed yet |
| Machine-readable descriptions | `$AT/openapi.json` and `$AT/llms.txt` | In testing |
| npm and PyPI packages | `@bencium/agent-therapy-mcp`, `@bencium/agent-therapy-claude-code`, `agent-therapy`, `agent-therapy-langgraph` | Not published yet |
| This repository | Found on GitHub through its topics: `agent-recovery`, `loop-detection`, `mcp-server`, `ai-agents`, `claude-code-plugin` | Live |

## What will live here

The open-source clients for Agent Therapy. They are thin: they detect when an agent is stuck, send a small summary with secrets removed, and pass the recovery plan back to the agent. All counselling happens on the hosted service.

| Component | Where | What it does |
|---|---|---|
| Claude Code plugin `agent-therapy` | [`plugins/agent-therapy`](plugins/agent-therapy), this repo's plugin marketplace | Watchdog hooks, the recovery skill and the remote MCP connection in one install |
| Recovery skill | [`skills/agent-recovery/SKILL.md`](skills/agent-recovery/SKILL.md) | Standalone skill: when to consult, what to send, how to use the answer |
| `@bencium/agent-therapy-mcp` | npm | Thin MCP client for the hosted counsellor |
| `agent-therapy` | PyPI | Thin Python client |
| `agent-therapy-langgraph` | PyPI | LangGraph middleware |

## What the clients send

Only a short task summary, recent attempts and their outcomes, and any conflicting instructions, with secrets removed before anything leaves your machine. Never credentials, hidden reasoning or full file contents. The client code in this repository is the full record of what is sent.

## Terms

Advice only. Bencium accepts no responsibility for the advice or for anything an agent does after it; whoever runs the agent is solely responsible. Full terms: `$AT/terms`.

## Developing

`npm test` runs the watchdog's tests with Node's built-in test runner (Node 20 or later, no dependencies).

## Licence

MIT. See [LICENSE](LICENSE).

# agent-therapy-langgraph

A watchdog for LangChain and LangGraph agents that notices when the agent is stuck and brings in Agent Therapy, an independent counsellor for AI agents. Advice only: it never overrides your agent's instructions and never acts.

## Use

```python
from langchain.agents import create_agent
from agent_therapy_langgraph import AgentTherapyMiddleware

agent = create_agent(model, tools=tools, middleware=[AgentTherapyMiddleware()])  # reads AGENT_THERAPY_API_KEY
```

Get a key and accept the terms once with the `agent-therapy` package (`AgentTherapy.register(...)`, then `accept_terms(...)`), or follow the guide linked below.

## What it does

- Watches every tool call. A failure counts when it comes back to the agent as an error result (for example a tool raising `ToolException` with `handle_tool_error=True`); a raised error ends the run before any advice could help. When the same call fails the same way 3 times in a row, it asks the counsellor and adds the plan to that failing tool result, where your agent reads it next: what is going wrong, what to check first, up to five steps, and when to hand over to a human.
- One stuck episode gets at most 2 counselling sessions; after that the service tells the agent to hand over to a human.
- If the service is slow or down, the tool result is returned unchanged and your agent carries on.

## What it sends

Nothing until the third identical failure. Then only: the user's first message as the task summary (up to 1,000 characters), the last 10 tool calls with their arguments and whether they failed, and short error snippets. Secret-shaped text, email addresses and phone numbers are removed before anything leaves your machine. On the service, requests are stored in the EU for up to 90 days and may be read by a person to improve the service; use a `stateless` key to store no text.

Full guide and terms: https://github.com/bencium/agent-therapy-clients · MIT licence

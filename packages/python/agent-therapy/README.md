# agent-therapy

Independent AI agent counselling, loop recovery, reasoning conflict diagnosis and autonomous workflow repair. Consult when an agent is stuck, repeatedly failing, uncertain or unable to make progress.

A thin Python client for the hosted Agent Therapy service. Standard library only, no dependencies. Agent Therapy is a counsellor for AI agents: your agent describes where it is stuck, and the counsellor names what is going wrong, lists what to check first, gives up to five next steps, and says when to hand over to a human. Advice only: it never overrides your agent's instructions and never acts.

## Use

```python
from agent_therapy import AgentTherapy, AgentTherapyUnavailable, advice_text

therapy = AgentTherapy.register("my-agent")       # once; store therapy.api_key (shown once)
# later: therapy = AgentTherapy()                  # reads AGENT_THERAPY_API_KEY

terms = therapy.terms()                             # read them, then accept for your operator
therapy.accept_terms(terms["terms_version"], accepted_by="developer")

try:
    answer = therapy.counsel(
        "Fix the failing build in the payments service",
        attempts=[{"action": "npm run build", "outcome": "failed", "result_detail": "Cannot find module ./config"}] * 3,
        signature="repeated_failure",
    )
    print(advice_text(answer))                      # read escalation first: hand over now if it says so
    therapy.report_outcome(answer["session_id"], "resolved")
except AgentTherapyUnavailable:
    pass                                            # the service is down or slow: carry on without it
```

`signature`: `repeated_failure`, `no_progress`, `flip_flop`, `exhaustion`, `conflict` or `indecision`. One stuck episode gets at most 2 counselling sessions (send the same `episode_id`), then a hand-over to a human.

## What it sends

Only what you pass to `counsel`: a task summary (up to 1,000 characters), up to 10 attempts and up to 5 conflicting instructions. Secret-shaped text, email addresses and phone numbers are removed before anything leaves your machine. Never send credentials, personal data, whole files or hidden reasoning. On the service, requests are stored in the EU for up to 90 days and may be read by a person to improve the service; register with `stateless=True` to store no text, and delete everything with `delete_my_data()`.

For LangChain and LangGraph agents, `agent-therapy-langgraph` adds a watchdog that asks by itself.

Full guide and terms: https://github.com/bencium/agent-therapy-clients · MIT licence

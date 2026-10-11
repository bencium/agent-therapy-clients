import unittest

from langchain.agents import create_agent
from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
from langchain_core.messages import AIMessage
from langchain_core.tools import ToolException, tool

from agent_therapy_langgraph import AgentTherapyMiddleware

ADVICE = {"status": "ok", "session_id": "s-1", "diagnosis": {"state": "ruminating", "summary": "The same call keeps failing."},
          "stop_retrying": True, "verify_first": ["Read the first error"], "recovery_plan": ["Stop retrying."],
          "escalation": {"required_now": False, "condition": "If the check fails.", "question_for_human": "Which config?"}}


class FakeTherapy:
    def __init__(self):
        self.requests = []

    def counsel(self, task_summary, **kwargs):
        self.requests.append({"task_summary": task_summary, **kwargs})
        return ADVICE


@tool
def build() -> str:
    """Builds the project."""
    raise ToolException("Cannot find module ./config")


build.handle_tool_error = True  # failures come back to the agent as error results, as in most real agents


class FakeModel(GenericFakeChatModel):
    def bind_tools(self, tools, **kwargs):
        return self


def calls(n):
    return [AIMessage(content="", tool_calls=[{"name": "build", "args": {}, "id": f"c{i}"}]) for i in range(n)] + [AIMessage(content="done")]


class MiddlewareTest(unittest.TestCase):
    def run_agent(self, failing_calls):
        therapy = FakeTherapy()
        agent = create_agent(FakeModel(messages=iter(calls(failing_calls))), tools=[build],
                             middleware=[AgentTherapyMiddleware(client=therapy)])
        result = agent.invoke({"messages": [{"role": "user", "content": "Fix the build, my key is sk-ant-abcdefghijklmnopqrstuvwxyz"}]})
        tool_results = [m for m in result["messages"] if m.type == "tool"]
        return therapy, tool_results

    def test_third_identical_failure_brings_in_the_counsellor(self):
        therapy, results = self.run_agent(3)
        self.assertEqual(len(therapy.requests), 1)
        request = therapy.requests[0]
        self.assertEqual(request["trigger"], "watchdog")
        self.assertEqual(request["framework"], "langgraph")
        self.assertEqual([a["outcome"] for a in request["attempts"]], ["failed"] * 3)
        self.assertNotIn("Agent Therapy", str(results[1].content))
        self.assertIn("State: ruminating", str(results[2].content))

    def test_two_failures_send_nothing(self):
        therapy, _ = self.run_agent(2)
        self.assertEqual(therapy.requests, [])


if __name__ == "__main__":
    unittest.main()

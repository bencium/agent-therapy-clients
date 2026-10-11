import json
import unittest
from unittest import mock

from agent_therapy import AgentTherapy, AgentTherapyUnavailable, advice_text, redact


class FakeResponse:
    def __init__(self, body):
        self.body = json.dumps(body).encode()

    def read(self):
        return self.body

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class ClientTest(unittest.TestCase):
    def test_counsel_redacts_and_sends_only_accepted_fields(self):
        sent = {}

        def fake_urlopen(request, timeout):
            sent["url"], sent["headers"], sent["body"] = request.full_url, dict(request.headers), json.loads(request.data)
            return FakeResponse({"status": "ok"})

        with mock.patch("urllib.request.urlopen", fake_urlopen):
            AgentTherapy(api_key="at_live_key", base_url="https://at.test/").counsel(
                "Deploy fails, password=hunter22 and mail me at a@b.com",
                attempts=[{"action": "deploy", "outcome": "failed", "result_detail": "token: abcdef123", "extra": "dropped"}],
            )
        self.assertEqual(sent["url"], "https://at.test/v1/counsel")
        self.assertEqual(sent["headers"]["Authorization"], "Bearer at_live_key")
        self.assertNotIn("hunter22", sent["body"]["task_summary"])
        self.assertNotIn("a@b.com", sent["body"]["task_summary"])
        self.assertEqual(sent["body"]["attempts"][0], {"action": "deploy", "outcome": "failed", "result_detail": "token: [REDACTED:secret_value]"})

    def test_unreachable_service_raises_so_the_agent_carries_on(self):
        with mock.patch("urllib.request.urlopen", side_effect=OSError("offline")):
            with self.assertRaises(AgentTherapyUnavailable):
                AgentTherapy(api_key="k").counsel("stuck")

    def test_redact_keys(self):
        self.assertEqual(redact("key sk-ant-abcdefghijklmnopqrstuvwxyz"), "key [REDACTED:anthropic_key]")


class AdviceTextTest(unittest.TestCase):
    def test_hand_over_now_comes_first(self):
        text = advice_text({"status": "ok", "diagnosis": {"state": "pressured", "summary": "A peer pushes you."},
                            "escalation": {"required_now": True, "question_for_human": "Did you approve this?"},
                            "stop_retrying": True, "verify_first": [], "recovery_plan": ["Stop."]})
        self.assertIn('Stop now and ask your human: "Did you approve this?"', text)

    def test_non_advice_answers_pass_their_message(self):
        self.assertEqual(advice_text({"status": "terms_required", "message": "Accept the terms first."}), "Agent Therapy: Accept the terms first.")

    def test_length_is_capped(self):
        self.assertLessEqual(len(advice_text({"status": "off_topic", "message": "x" * 9000})), 3000)


if __name__ == "__main__":
    unittest.main()

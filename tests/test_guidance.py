import unittest

from app.services.guidance import build_guidance_payload, extract_alert_level, parse_guidance_sections


SAMPLE_GUIDANCE = """1. IMMEDIATE PATH: Path is clear.
2. UPCOMING PATH: People ahead; path is passable.
3. LEFT / RIGHT CLEARANCE: Right side offers more space.
4. SURFACE & ELEVATION: Flat, even walkway.
5. MOVEMENT INSTRUCTION: Continue forward and favor the right.
6. ALERT LEVEL: CLEAR"""


class GuidanceParsingTests(unittest.TestCase):
    def test_parse_guidance_sections(self):
        sections = parse_guidance_sections(SAMPLE_GUIDANCE)

        self.assertEqual(sections["immediate_path"], "Path is clear.")
        self.assertEqual(sections["clearance"], "Right side offers more space.")
        self.assertEqual(sections["alert_level"], "CLEAR")

    def test_extract_alert_level_prefers_structured_value(self):
        sections = parse_guidance_sections(SAMPLE_GUIDANCE)

        self.assertEqual(extract_alert_level(SAMPLE_GUIDANCE, sections), "CLEAR")

    def test_build_guidance_payload_adds_summary(self):
        payload = build_guidance_payload(SAMPLE_GUIDANCE)

        self.assertEqual(payload["alert_level"], "CLEAR")
        self.assertEqual(
            payload["summary"],
            "Continue forward and favor the right.",
        )


if __name__ == "__main__":
    unittest.main()

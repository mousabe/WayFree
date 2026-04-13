import re

SECTION_LABELS = {
    "immediate_path": "IMMEDIATE PATH",
    "upcoming_path": "UPCOMING PATH",
    "clearance": "LEFT / RIGHT CLEARANCE",
    "surface": "SURFACE & ELEVATION",
    "movement": "MOVEMENT INSTRUCTION",
    "alert_level": "ALERT LEVEL",
}

SECTION_PATTERN = re.compile(r"^\s*\d\.\s*([A-Z /&]+):\s*(.+?)\s*$")
ALERT_LEVELS = ("STOP", "CAUTION", "CLEAR")


def parse_guidance_sections(description: str) -> dict[str, str]:
    sections = {key: "" for key in SECTION_LABELS}

    for line in description.splitlines():
        match = SECTION_PATTERN.match(line)
        if not match:
            continue

        section_name, section_value = match.groups()
        normalized_name = section_name.strip()
        for key, label in SECTION_LABELS.items():
            if normalized_name == label:
                sections[key] = section_value.strip()
                break

    return sections


def extract_alert_level(description: str, sections: dict[str, str] | None = None) -> str:
    parsed_sections = sections or parse_guidance_sections(description)
    alert_text = parsed_sections.get("alert_level", "").upper()
    haystack = f"{alert_text}\n{description.upper()}"

    for level in ALERT_LEVELS:
        if level in haystack:
            return level

    return "CLEAR"


def build_guidance_payload(description: str) -> dict[str, object]:
    sections = parse_guidance_sections(description)
    return {
        "description": description,
        "alert_level": extract_alert_level(description, sections),
        "sections": sections,
        "summary": (
            sections["movement"]
            or sections["immediate_path"]
            or sections["upcoming_path"]
            or description.strip()
        ),
    }

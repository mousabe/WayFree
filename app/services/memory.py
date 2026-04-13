from collections import deque
from dataclasses import dataclass, field
from threading import Lock

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_groq import ChatGroq

from app.config import (
    GROQ_API_KEY,
    MODEL_ID,
    SESSION_MEMORY_SIZE,
    SYSTEM_PROMPT,
    TEMPERATURE,
)

llm = ChatGroq(
    api_key=GROQ_API_KEY,
    model=MODEL_ID,
    temperature=TEMPERATURE,
    max_tokens=200
)


@dataclass
class SessionMemory:
    recent_guidance: deque[str] = field(
        default_factory=lambda: deque(maxlen=SESSION_MEMORY_SIZE)
    )


session_memories: dict[str, SessionMemory] = {}
session_lock = Lock()


def start_session(session_id: str) -> None:
    with session_lock:
        session_memories.setdefault(session_id, SessionMemory())


def end_session(session_id: str) -> None:
    with session_lock:
        session_memories.pop(session_id, None)


def get_active_session_count() -> int:
    with session_lock:
        return len(session_memories)


def _recent_context_for(session_id: str) -> list[str]:
    with session_lock:
        session = session_memories.setdefault(session_id, SessionMemory())
        return list(session.recent_guidance)[-2:]


def _remember(session_id: str, guidance: str) -> None:
    with session_lock:
        session = session_memories.setdefault(session_id, SessionMemory())
        session.recent_guidance.append(guidance)


def should_narrate(previous: str, current: str) -> bool:
    if not previous:
        return True

    prev_alert = "CLEAR"
    curr_alert = "CLEAR"
    for level in ["STOP", "CAUTION", "CLEAR"]:
        if level in previous.upper():
            prev_alert = level
        if level in current.upper():
            curr_alert = level

    if prev_alert != curr_alert:
        return True

    prev_words = set(previous.lower().split())
    curr_words = set(current.lower().split())
    if not prev_words:
        return True

    overlap = len(prev_words & curr_words) / len(prev_words | curr_words)
    return overlap < 0.75


def get_contextual_description(session_id: str, image_base64: str) -> str:
    context = ""
    recent = _recent_context_for(session_id)
    if recent:
        context = f"\nRecent navigation context (do not repeat these):\n" + "\n".join(recent)

    enhanced_prompt = SYSTEM_PROMPT + context

    response = llm.invoke([
        SystemMessage(content=enhanced_prompt),
        HumanMessage(content=[
            {
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{image_base64}"}
            },
            {
                "type": "text",
                "text": "Describe the navigation environment."
            }
        ])
    ])

    result = response.content.strip()

    if "NO_CHANGE" in result.upper():
        return ""

    _remember(session_id, result)
    return result

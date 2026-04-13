import asyncio
from datetime import datetime, timezone

import socketio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import APP_NAME, APP_VERSION, CORS_ORIGINS, MODEL_ID
from app.routers import vision
from app.services.guidance import build_guidance_payload
from app.services.memory import (
    end_session,
    get_active_session_count,
    get_contextual_description,
    should_narrate,
    start_session,
)

sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")

fastapi_app = FastAPI(
    title=APP_NAME,
    description="Real-time blind navigation assistant powered by vision-language models",
    version=APP_VERSION
)

fastapi_app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

fastapi_app.include_router(vision.router)

@fastapi_app.get("/health", tags=["meta"])
async def health():
    return {
        "status": "ok",
        "version": APP_VERSION,
        "model": MODEL_ID,
        "active_sessions": get_active_session_count(),
    }

@sio.event
async def connect(sid, environ):
    start_session(sid)
    print(f"Client connected: {sid}")

@sio.event
async def disconnect(sid):
    end_session(sid)
    print(f"Client disconnected: {sid}")

@sio.event
async def frame(sid, data):
    try:
        image = data.get("image")
        if not image:
            await sio.emit(
                "error",
                {"message": "No frame payload was provided."},
                to=sid
            )
            return

        previous = data.get("previous", "")

        loop = asyncio.get_running_loop()
        description = await loop.run_in_executor(
            None, get_contextual_description, sid, image
        )

        if not description:
            payload = build_guidance_payload(previous)
            payload.update({
                "text": previous,
                "changed": False,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            })
            await sio.emit("description", payload, to=sid)
            return

        narrate = await loop.run_in_executor(
            None, should_narrate, previous, description
        )

        payload = build_guidance_payload(description)
        payload.update({
            "text": description,
            "changed": narrate,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        await sio.emit("description", payload, to=sid)

    except Exception as e:
        await sio.emit("error", {"message": str(e)}, to=sid)

app = socketio.ASGIApp(sio, fastapi_app)

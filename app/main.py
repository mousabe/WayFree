import socketio
from fastapi import FastAPI
from app.routers import vision

sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")

fastapi_app = FastAPI(
    title="Wayfree",
    description="Real-time blind navigation assistant powered by vision-language models",
    version="0.2.0"
)

fastapi_app.include_router(vision.router)

@fastapi_app.get("/health", tags=["meta"])
async def health():
    return {"status": "ok", "version": "0.2.0"}

@sio.event
async def connect(sid, environ):
    print(f"Client connected: {sid}")

@sio.event
async def disconnect(sid):
    print(f"Client disconnected: {sid}")

@sio.event
async def frame(sid, data):
    from app.services.llava import llava_service
    try:
        description = llava_service.describe(data["image"])
        await sio.emit("description", {"text": description}, to=sid)
    except Exception as e:
        await sio.emit("error", {"message": str(e)}, to=sid)

app = socketio.ASGIApp(sio, fastapi_app)
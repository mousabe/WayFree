from fastapi import FastAPI
from app.routers import vision

app = FastAPI(
    title="Wayfree",
    description="Real-time blind navigation assistant powered by vision-language models",
    version="0.1.0"
)

app.include_router(vision.router)

@app.get("/health", tags=["meta"])
async def health():
    return {"status": "ok", "version": "0.1.0"}
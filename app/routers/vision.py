from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.guidance import build_guidance_payload
from app.services.llava import vision_service

router = APIRouter(prefix="/vision", tags=["vision"])

class FrameRequest(BaseModel):
    image_base64: str

class DescriptionResponse(BaseModel):
    description: str
    alert_level: str
    sections: dict[str, str]
    summary: str

@router.post("/describe", response_model=DescriptionResponse)
async def describe_frame(req: FrameRequest):
    try:
        description = vision_service.describe(req.image_base64)
        return DescriptionResponse(**build_guidance_payload(description))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Vision model error: {str(e)}")

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services.llava import llava_service
import requests

router = APIRouter(prefix="/vision", tags=["vision"])

class FrameRequest(BaseModel):
    image_base64: str

class DescriptionResponse(BaseModel):
    description: str

@router.post("/describe", response_model=DescriptionResponse)
async def describe_frame(req: FrameRequest):
    try:
        description = llava_service.describe(req.image_base64)
        return DescriptionResponse(description=description)
    except requests.Timeout:
        raise HTTPException(status_code=504, detail="LLaVA timed out — model may still be loading")
    except requests.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"HuggingFace API error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
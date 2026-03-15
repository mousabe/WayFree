from groq import Groq
from app.config import GROQ_API_KEY, SYSTEM_PROMPT, MAX_NEW_TOKENS, TEMPERATURE, MODEL_ID

client = Groq(api_key=GROQ_API_KEY)

class LLaVAService:
    def describe(self, image_base64: str) -> str:
        response = client.chat.completions.create(
            model=MODEL_ID,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{image_base64}"
                            }
                        },
                        {
                            "type": "text",
                            "text": SYSTEM_PROMPT
                        }
                    ]
                }
            ],
            max_tokens=MAX_NEW_TOKENS,
            temperature=TEMPERATURE
        )
        return response.choices[0].message.content.strip()

llava_service = LLaVAService()
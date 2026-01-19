"""
OpenAI API Client
"""

import os
import logging
from typing import Optional
from dotenv import load_dotenv
from openai import AsyncOpenAI

load_dotenv()
logger = logging.getLogger(__name__)

class OpenAIClient:
    """OpenAI APIクライアント"""

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        if not self.api_key:
            logger.warning("⚠️ OPENAI_API_KEY not set.")
            self.enabled = False
            return

        self.client = AsyncOpenAI(api_key=self.api_key)
        self.enabled = True
        logger.info("✅ OpenAI API initialized")

    async def generate_text(self, system_prompt: str, user_prompt: str, model: str = "gpt-4o") -> Optional[str]:
        """
        OpenAIでテキスト生成
        """
        if not self.enabled:
            return None

        try:
            response = await self.client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.7
            )
            return response.choices[0].message.content
        except Exception as e:
            logger.error(f"Failed to generate text (OpenAI): {e}")
            return None

openai_client = OpenAIClient()

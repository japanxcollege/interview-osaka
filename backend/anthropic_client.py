
import os
import logging
from typing import Optional
from dotenv import load_dotenv
from anthropic import AsyncAnthropic

load_dotenv()
logger = logging.getLogger(__name__)

class AnthropicClient:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("ANTHROPIC_API_KEY")
        self.enabled = False
        self.client: Optional[AsyncAnthropic] = None
        self.model = "claude-3-5-sonnet-20240620"  # Default to Sonnet 3.5

        self._init_client()

    def _init_client(self) -> None:
        if not self.api_key:
            logger.warning("⚠️ ANTHROPIC_API_KEY not set. Claude features disabled.")
            self.enabled = False
            return
        
        try:
            self.client = AsyncAnthropic(api_key=self.api_key)
            self.enabled = True
            logger.info("✅ Anthropic Claude client initialised")
        except Exception as e:
            logger.error(f"Failed to initialise Anthropic client: {e}")
            self.enabled = False

    async def generate_text(self, system_prompt: str, user_prompt: str) -> Optional[str]:
        """Claudeでテキスト生成"""
        if not self.enabled or not self.client:
            return None

        try:
            message = await self.client.messages.create(
                model=self.model,
                max_tokens=4000,
                temperature=0.7,
                system=system_prompt,
                messages=[
                    {"role": "user", "content": user_prompt}
                ]
            )
            
            if message.content and len(message.content) > 0:
                return message.content[0].text
            return None
        except Exception as e:
            logger.error(f"Anthropic API error: {e}")
            return None

anthropic_client = AnthropicClient()

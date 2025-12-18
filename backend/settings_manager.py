
import json
import os
import logging
from pathlib import Path
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

class SettingsManager:
    def __init__(self, config_path: str = "config.json"):
        self.config_path = Path(config_path)
        self.settings: Dict[str, Any] = {}
        self._load_settings()

    def _load_settings(self) -> None:
        if not self.config_path.exists():
            # Create default
            self.settings = {
                "whisper_provider": os.getenv("WHISPER_PROVIDER", "openai"),
                "whisper_model": os.getenv("WHISPER_MODEL", "gpt-4o-mini-transcribe"),
                "openai_api_key": os.getenv("OPENAI_API_KEY", ""),
                "anthropic_api_key": os.getenv("ANTHROPIC_API_KEY", ""),
                "gemini_api_key": os.getenv("GEMINI_API_KEY", "")
            }
            self._save_settings()
        else:
            try:
                with open(self.config_path, "r", encoding="utf-8") as f:
                    self.settings = json.load(f)
            except Exception as e:
                logger.error(f"Failed to load settings: {e}")
                self.settings = {}

    def _save_settings(self) -> None:
        try:
            with open(self.config_path, "w", encoding="utf-8") as f:
                json.dump(self.settings, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save settings: {e}")

    def get_setting(self, key: str, default: Any = None) -> Any:
        return self.settings.get(key, default)

    def update_settings(self, new_settings: Dict[str, Any]) -> None:
        self.settings.update(new_settings)
        self._save_settings()

settings_manager = SettingsManager()


import json
import logging
from pathlib import Path
from typing import List, Optional, Dict, Any
from pydantic import BaseModel

logger = logging.getLogger(__name__)

class PromptStyle(BaseModel):
    id: str
    name: str
    description: str
    instruction: str

class StyleManager:
    def __init__(self, data_path: str = "data/styles.json"):
        self.data_path = Path(data_path)
        self.styles: List[PromptStyle] = []
        self._load()

    def _load(self):
        if not self.data_path.exists():
            # Seed defaults
            self.styles = [
                PromptStyle(
                    id="qa", 
                    name="対談・Q&A", 
                    description="質問と回答を明確に分ける", 
                    instruction="Q&A形式（対談形式）で、質問と回答が明確に分かるように構成してください。"
                ),
                PromptStyle(
                    id="narrative", 
                    name="一人称・エッセイ", 
                    description="「私」の視点で語る", 
                    instruction="一人称（私）の語り口調で、エッセイやストーリーテリングのように構成してください。"
                ),
                PromptStyle(
                    id="summary", 
                    name="レポート・要約", 
                    description="三人称で要点をまとめる", 
                    instruction="三人称視点で、重要な事実と要点をまとめたレポート形式で構成してください。"
                )
            ]
            self._save()
        else:
            try:
                with open(self.data_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self.styles = [PromptStyle(**item) for item in data]
            except Exception as e:
                logger.error(f"Failed to load styles: {e}")
                self.styles = []

    def _save(self):
        try:
            self.data_path.parent.mkdir(parents=True, exist_ok=True)
            with open(self.data_path, "w", encoding="utf-8") as f:
                json.dump([s.dict() for s in self.styles], f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.error(f"Failed to save styles: {e}")

    def get_all(self) -> List[PromptStyle]:
        return self.styles

    def get_by_id(self, style_id: str) -> Optional[PromptStyle]:
        for s in self.styles:
            if s.id == style_id:
                return s
        return None

    def add_style(self, style: PromptStyle):
        if self.get_by_id(style.id):
            raise ValueError(f"Style ID {style.id} already exists")
        self.styles.append(style)
        self._save()

    def update_style(self, style_id: str, updates: Dict[str, Any]):
        for i, s in enumerate(self.styles):
            if s.id == style_id:
                updated_data = s.dict()
                updated_data.update(updates)
                self.styles[i] = PromptStyle(**updated_data)
                self._save()
                return self.styles[i]
        raise ValueError(f"Style ID {style_id} not found")

    def delete_style(self, style_id: str):
        self.styles = [s for s in self.styles if s.id != style_id]
        self._save()

style_manager = StyleManager()

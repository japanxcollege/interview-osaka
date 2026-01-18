"""
データモデル定義
Phase 0: 基本的なセッション、発話、メモ、記事原稿
Phase 1: Discord統合、AI機能、要約
"""

from pydantic import BaseModel
from typing import List, Optional, Literal, Dict
from datetime import datetime
import secrets


class Utterance(BaseModel):
    """文字起こしの1発話"""
    utterance_id: str
    speaker_id: str
    speaker_name: str
    timestamp: str  # ISO 8601
    text: str


class Note(BaseModel):
    """インタビュー中のメモ"""
    note_id: str
    timestamp: str  # ISO 8601
    text: str


class ArticleDraft(BaseModel):
    """記事原稿"""
    draft_id: str = "default"      # ID
    name: str = "Original Draft"   # 表示名
    style_id: str = "qa"           # プロンプトスタイルID
    text: str
    last_updated: str  # ISO 8601


class InterviewSession(BaseModel):
    """インタビューセッション"""
    session_id: str
    title: str
    created_at: str  # ISO 8601
    status: Literal['preparing', 'recording', 'editing', 'completed']
    transcript: List[Utterance] = []
    article_draft: ArticleDraft              # 現在アクティブな原稿
    drafts: List[ArticleDraft] = []          # 原稿の履歴/バリエーション
    notes: List[Note] = []

    # Phase 1: Discord統合
    session_key: Optional[str] = None              # "sk_abc123xyz" - Webアクセス用
    discord_channel_id: Optional[str] = None       # DiscordチャンネルID
    discord_voice_channel_id: Optional[str] = None # Discordボイスチャンネル ID

    # Phase 1: 要約機能
    front_summary: Optional[str] = ""              # 直近3分以前の要約
    recent_transcript: List[Utterance] = []        # 直近3分の発話

    # Phase 1: AI機能
    suggested_questions: List[str] = []            # AIによる質問提案
    auto_summary: Optional[str] = ""               # 最終要約
    last_article_transcript_index: int = 0         # 原稿生成に利用済みの発話数
    last_question_transcript_index: int = 0        # 質問提案に利用済みの発話数
    pending_ai_article_count: int = 0              # 原稿生成用の未処理カウント
    pending_ai_question_count: int = 0             # 質問提案用の未処理カウント

    # Phase 2: AI Interviewer (Reflection) features
    axes_selected: List[str] = []                  # ["past", "now", "next"]
    draft_content: Dict[str, str] = {              # Split draft content
        "facts_md": "",
        "feelings_md": ""
    }
    ai_mode: str = "empath"                        # "empath", "friction", "rephrase"
    versions: List["Version"] = []                 # History of snapshots

    # Phase 3: Interactive Wizard
    interview_style: str = "qa"                    # "qa", "narrative", "summary"
    user_key_points: List[str] = []                # Waiting input points
    context: Optional[str] = ""                    # Waiting input context
    upload_progress: int = 0                       # Upload progress (0-100)
    upload_error: Optional[str] = None             # Upload error message


class Version(BaseModel):
    """セッションのバージョン（スナップショット）"""
    version_id: str
    session_id: str
    version_number: int
    created_at: str  # ISO 8601
    snapshot: Dict   # Full snapshot of facts_md, feelings_md, axes, etc.
    diff_meta: Optional[Dict] = None  # Optional: Calculated diff metadata given frontend can do it too


# Resolves the forward reference in InterviewSession
InterviewSession.model_rebuild()


# リクエスト/レスポンス用モデル
class CreateSessionRequest(BaseModel):
    """セッション作成リクエスト"""
    title: str
    discord_channel_id: Optional[str] = None  # Phase 1: Discord連携時


class AddNoteRequest(BaseModel):
    """メモ追加リクエスト"""
    text: str


class UpdateArticleRequest(BaseModel):
    """原稿更新リクエスト"""
    text: str


# Phase 1: Helper functions
def generate_session_key() -> str:
    """セッションキーを生成: sk_xxxxxxxxxxxxxxxx"""
    return f"sk_{secrets.token_urlsafe(16)}"

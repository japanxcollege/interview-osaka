"""
セッション管理
- CRUD操作
- JSON永続化
- 排他制御
Phase 1: Discord連携、セッションキー管理
"""

import asyncio
import json
import logging
import os
import re
from datetime import datetime
from typing import Dict, Optional, List
from pathlib import Path

from models import InterviewSession, Utterance, Note, ArticleDraft, generate_session_key

logger = logging.getLogger(__name__)


class SessionManager:
    def __init__(self, data_dir: str = "data/sessions"):
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)

        # メモリ上のセッションキャッシュ
        self.sessions: Dict[str, InterviewSession] = {}

        # 排他制御用のロック
        self.locks: Dict[str, asyncio.Lock] = {}

    def _generate_session_id(self) -> str:
        """セッションID生成: session_YYYYMMDD_HHMMSS"""
        return f"session_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

    def _generate_utterance_id(self) -> str:
        """発話ID生成: utterance_YYYYMMDD_HHMMSS_MICROSEC"""
        now = datetime.now()
        return f"utterance_{now.strftime('%Y%m%d_%H%M%S_%f')}"

    def _generate_note_id(self) -> str:
        """メモID生成: note_YYYYMMDD_HHMMSS_MICROSEC"""
        now = datetime.now()
        return f"note_{now.strftime('%Y%m%d_%H%M%S_%f')}"

    def _get_session_path(self, session_id: str) -> Path:
        """セッションのファイルパスを取得"""
        return self.data_dir / f"{session_id}.json"

    def _ensure_lock(self, session_id: str) -> None:
        """指定セッションのロックを確保"""
        if session_id not in self.locks:
            self.locks[session_id] = asyncio.Lock()

    def create_session(
        self,
        title: str,
        discord_channel_id: Optional[str] = None
    ) -> InterviewSession:
        """
        新規セッション作成

        Args:
            title: セッションタイトル
            discord_channel_id: DiscordチャンネルID (Phase 1)

        Returns:
            作成されたセッション
        """
        session_id = self._generate_session_id()
        now = datetime.now().isoformat()

        # Phase 1: セッションキーを生成
        session_key = generate_session_key()

        session = InterviewSession(
            session_id=session_id,
            session_key=session_key,
            title=title,
            created_at=now,
            status='preparing',
            transcript=[],
            article_draft=ArticleDraft(
                text="",
                last_updated=now
            ),
            notes=[],
            discord_channel_id=discord_channel_id,
            recent_transcript=[],
            suggested_questions=[],
            last_article_transcript_index=0,
            last_question_transcript_index=0,
            pending_ai_article_count=0,
            pending_ai_question_count=0
        )

        # メモリに保存
        self.sessions[session_id] = session
        self.locks[session_id] = asyncio.Lock()

        # ディスクに保存
        self._save_session(session_id)

        return session

    def get_session(self, session_id: str) -> Optional[InterviewSession]:
        """セッション取得（メモリ or ディスク）"""
        # メモリにあればそれを返す
        if session_id in self.sessions:
            return self.sessions[session_id]

        # ディスクから読み込み
        session_path = self._get_session_path(session_id)
        if not session_path.exists():
            return None

        with open(session_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            session = InterviewSession(**data)



            # メモリにキャッシュ
            self.sessions[session_id] = session
            if session_id not in self.locks:
                self.locks[session_id] = asyncio.Lock()

            # Migration: Ensure drafts list is populated
            if not session.drafts and session.article_draft:
                # Assign a default ID if missing (though model has default)
                if session.article_draft.draft_id == "default":
                    session.article_draft.draft_id = f"draft_{int(datetime.now().timestamp())}"
                
                # Copy to drafts
                import copy
                session.drafts.append(copy.deepcopy(session.article_draft))
                # _save_session is called when needed, maybe not here to avoid disk I/O on every read? 
                # But migration is one-off. Let's strictly only save if we modified it deeply? 
                # Actually safest to not save on read unless necessary. 
                # But if we don't save, subsequent reads might re-migrate with NEW ID.
                # So we SHOULD save if we generated a timestamp-based ID.
                self._save_session(session_id)

            return session

    def list_sessions(self) -> list[InterviewSession]:
        """全セッション一覧取得"""
        sessions = []

        # ディスクから全セッションを読み込み
        for session_file in self.data_dir.glob("session_*.json"):
            with open(session_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                sessions.append(InterviewSession(**data))

        # 作成日時でソート（新しい順）
        sessions.sort(key=lambda s: s.created_at, reverse=True)
        return sessions

    async def add_utterance(self, session_id: str, utterance: Utterance) -> None:
        """文字起こし追加"""
        self._ensure_lock(session_id)
        async with self.locks[session_id]:
            session = self.get_session(session_id)
            if not session:
                raise ValueError(f"Session {session_id} not found")

            session.transcript.append(utterance)
            self._save_session(session_id)

    async def update_article(self, session_id: str, text: str) -> None:
        """原稿更新"""
        async with self.locks[session_id]:
            session = self.get_session(session_id)
            if not session:
                raise ValueError(f"Session {session_id} not found")

            session.article_draft.text = text
            session.article_draft.last_updated = datetime.now().isoformat()
            
            # Update corresponding draft in history
            found = False
            for d in session.drafts:
                if d.draft_id == session.article_draft.draft_id:
                    d.text = text
                    d.last_updated = session.article_draft.last_updated
                    found = True
                    break
            
            if not found:
                # If not found (shouldn't happen if migrated correctly), append it
                session.drafts.append(session.article_draft)

            self._save_session(session_id)

    async def add_draft(self, session_id: str, draft: ArticleDraft) -> None:
        """新しいドラフトを追加"""
        self._ensure_lock(session_id)
        async with self.locks[session_id]:
            session = self.get_session(session_id)
            if not session:
                raise ValueError(f"Session {session_id} not found")
            
            session.drafts.append(draft)
            self._save_session(session_id)

    async def switch_draft(self, session_id: str, draft_id: str) -> Optional[ArticleDraft]:
        """アクティブなドラフトを切り替え"""
        self._ensure_lock(session_id)
        async with self.locks[session_id]:
            session = self.get_session(session_id)
            if not session:
                raise ValueError(f"Session {session_id} not found")
            
            target = next((d for d in session.drafts if d.draft_id == draft_id), None)
            if target:
                import copy
                session.article_draft = copy.deepcopy(target)
                self._save_session(session_id)
                return session.article_draft
            return None

    async def append_article_section(
        self,
        session_id: str,
        section_text: str,
        transcript_count: int
    ):
        """原稿にセクションを追記し、利用済み発話数を更新"""
        self._ensure_lock(session_id)
        async with self.locks[session_id]:
            session = self.get_session(session_id)
            if not session:
                raise ValueError(f"Session {session_id} not found")

            new_section = section_text.strip()
            if not new_section:
                return session.article_draft

            current_text = session.article_draft.text.rstrip()
            if current_text:
                session.article_draft.text = f"{current_text}\n\n{new_section}"
            else:
                session.article_draft.text = new_section

            session.article_draft.last_updated = datetime.now().isoformat()
            session.last_article_transcript_index = transcript_count
            self._save_session(session_id)
            return session.article_draft

    async def add_note(self, session_id: str, text: str) -> Note:
        """メモ追加"""
        self._ensure_lock(session_id)
        async with self.locks[session_id]:
            session = self.get_session(session_id)
            if not session:
                raise ValueError(f"Session {session_id} not found")

            note = Note(
                note_id=self._generate_note_id(),
                timestamp=datetime.now().isoformat(),
                text=text
            )

            session.notes.append(note)
            self._save_session(session_id)
            return note

    async def delete_note(self, session_id: str, note_id: str) -> None:
        """メモ削除"""
        self._ensure_lock(session_id)
        async with self.locks[session_id]:
            session = self.get_session(session_id)
            if not session:
                raise ValueError(f"Session {session_id} not found")

            session.notes = [n for n in session.notes if n.note_id != note_id]
            self._save_session(session_id)

    async def edit_utterance(self, session_id: str, utterance_id: str, text: str, speaker_name: str) -> Utterance:
        """発話編集"""
        self._ensure_lock(session_id)
        async with self.locks[session_id]:
            session = self.get_session(session_id)
            if not session:
                raise ValueError(f"Session {session_id} not found")

            for utterance in session.transcript:
                if utterance.utterance_id == utterance_id:
                    utterance.text = text
                    utterance.speaker_name = speaker_name
                    self._save_session(session_id)
                    return utterance

            raise ValueError(f"Utterance {utterance_id} not found")

    async def delete_utterance(self, session_id: str, utterance_id: str) -> None:
        """発話削除"""
        self._ensure_lock(session_id)
        async with self.locks[session_id]:
            session = self.get_session(session_id)
            if not session:
                raise ValueError(f"Session {session_id} not found")

            session.transcript = [u for u in session.transcript if u.utterance_id != utterance_id]
            self._save_session(session_id)

    async def update_status(self, session_id: str, status: str) -> None:
        """ステータス更新"""
        self._ensure_lock(session_id)
        async with self.locks[session_id]:
            session = self.get_session(session_id)
            if not session:
                raise ValueError(f"Session {session_id} not found")

            session.status = status
            self._save_session(session_id)

    def _save_session(self, session_id: str) -> None:
        """セッションをJSONに保存"""
        session = self.sessions.get(session_id)
        if not session:
            return

        session_path = self._get_session_path(session_id)
        with open(session_path, 'w', encoding='utf-8') as f:
            json.dump(session.model_dump(), f, ensure_ascii=False, indent=2)

    # ========== Phase 1: 新機能 ==========

    def get_session_by_key(self, session_key: str) -> Optional[InterviewSession]:
        """
        セッションキーからセッションを取得

        Args:
            session_key: セッションキー (sk_xxx)

        Returns:
            セッション or None
        """
        # メモリ内を検索
        for session in self.sessions.values():
            if session.session_key == session_key:
                return session

        # ディスク内を検索
        for session_file in self.data_dir.glob("session_*.json"):
            with open(session_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if data.get('session_key') == session_key:
                    session = InterviewSession(**data)
                    # キャッシュに追加
                    self.sessions[session.session_id] = session
                    if session.session_id not in self.locks:
                        self.locks[session.session_id] = asyncio.Lock()
                    return session

        return None

    def get_session_by_discord_channel(
        self,
        discord_channel_id: str
    ) -> Optional[InterviewSession]:
        """
        DiscordチャンネルIDからアクティブなセッションを取得

        Args:
            discord_channel_id: DiscordチャンネルID

        Returns:
            セッション or None
        """
        # メモリ内を検索 (recordingステータスのみ)
        for session in self.sessions.values():
            if (session.discord_channel_id == discord_channel_id and
                session.status == 'recording'):
                return session

        # ディスク内を検索
        for session_file in self.data_dir.glob("session_*.json"):
            with open(session_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if (data.get('discord_channel_id') == discord_channel_id and
                    data.get('status') == 'recording'):
                    session = InterviewSession(**data)
                    # キャッシュに追加
                    self.sessions[session.session_id] = session
                    if session.session_id not in self.locks:
                        self.locks[session.session_id] = asyncio.Lock()
                    return session

        return None

    async def add_suggested_question(
        self,
        session_id: str,
        question: str,
        transcript_count: Optional[int] = None
    ) -> None:
        """AI質問提案を追加"""
        self._ensure_lock(session_id)
        async with self.locks[session_id]:
            session = self.get_session(session_id)
            if not session:
                raise ValueError(f"Session {session_id} not found")

            session.suggested_questions.append(question)
            # 最新5件のみ保持
            if len(session.suggested_questions) > 5:
                session.suggested_questions = session.suggested_questions[-5:]

            session.last_question_transcript_index = transcript_count or len(session.transcript)

            self._save_session(session_id)

    async def update_summary(
        self,
        session_id: str,
        front_summary: Optional[str] = None,
        auto_summary: Optional[str] = None
    ) -> None:
        """要約を更新"""
        self._ensure_lock(session_id)
        async with self.locks[session_id]:
            session = self.get_session(session_id)
            if not session:
                raise ValueError(f"Session {session_id} not found")

            if front_summary is not None:
                session.front_summary = front_summary

            if auto_summary is not None:
                session.auto_summary = auto_summary

            self._save_session(session_id)

    async def update_recent_transcript(
        self,
        session_id: str,
        recent_transcript: List[Utterance]
    ) -> None:
        """直近の発話リストを更新"""
        self._ensure_lock(session_id)
        async with self.locks[session_id]:
            session = self.get_session(session_id)
            if not session:
                raise ValueError(f"Session {session_id} not found")

            session.recent_transcript = recent_transcript
            self._save_session(session_id)

    @staticmethod
    def _normalize_text_for_comparison(text: str) -> str:
        no_ws = re.sub(r'\s+', '', (text or ''))
        return no_ws.strip().lower()

    async def add_transcription_text(
        self,
        session_id: str,
        text: str,
        speaker_id: str = "speaker_web",
        speaker_name: str = "Interviewer"
    ) -> Optional[Utterance]:
        """Whisperで取得した文字起こしをセッションに追加"""
        self._ensure_lock(session_id)
        async with self.locks[session_id]:
            session = self.get_session(session_id)
            if not session:
                raise ValueError(f"Session {session_id} not found")

            normalized_text = text.strip()
            if not normalized_text:
                logger.debug("SessionManager: Empty text, returning None")
                return None

            norm_key = self._normalize_text_for_comparison(normalized_text)
            if not norm_key:
                logger.debug("SessionManager: Empty normalized key, returning None")
                return None

            # 直近10件の発話と比較して重複をチェック
            if session.transcript:
                recent_10 = session.transcript[-10:] if len(session.transcript) >= 10 else session.transcript
                for prev_utterance in recent_10:
                    # 正規化キーでの比較
                    prev_key = self._normalize_text_for_comparison(prev_utterance.text)
                    if prev_utterance.speaker_id == speaker_id and prev_key == norm_key:
                        logger.info("🚫 SessionManager: Duplicate found (normalized) in recent 10 for %s: '%s'", 
                                   session_id, normalized_text[:50])
                        return None
                    # 完全一致での比較（直近3件のみ）
                    if prev_utterance.speaker_id == speaker_id and prev_utterance.text.strip() == normalized_text:
                        logger.info("🚫 SessionManager: Exact duplicate found in recent for %s: '%s'", 
                                   session_id, normalized_text[:50])
                        return None

            logger.info("✅ SessionManager: Adding new utterance for %s: '%s'", 
                       session_id, normalized_text[:50])

            utterance = Utterance(
                utterance_id=self._generate_utterance_id(),
                speaker_id=speaker_id,
                speaker_name=speaker_name,
                timestamp=datetime.now().isoformat(),
                text=normalized_text
            )

            session.transcript.append(utterance)

            # 直近の発話も更新（最大20件保持）
            session.recent_transcript.append(utterance)
            if len(session.recent_transcript) > 20:
                session.recent_transcript = session.recent_transcript[-20:]

            session.pending_ai_article_count += 1
            session.pending_ai_question_count += 1

            self._save_session(session_id)
            return utterance

    async def reset_ai_counters(
        self,
        session_id: str,
        article_count: int = 0,
        question_count: int = 0
    ) -> None:
        """AIトリガー用カウンタを更新"""
        self._ensure_lock(session_id)
        async with self.locks[session_id]:
            session = self.get_session(session_id)
            if not session:
                raise ValueError(f"Session {session_id} not found")

            if article_count is not None:
                session.pending_ai_article_count = article_count
            if question_count is not None:
                session.pending_ai_question_count = question_count

            self._save_session(session_id)

    async def update_upload_progress(self, session_id: str, progress: int) -> None:
        """アップロード/処理進捗を更新"""
        self._ensure_lock(session_id)
        async with self.locks[session_id]:
            session = self.get_session(session_id)
            if session:
                session.upload_progress = progress
                # Progress updates might happen frequently, maybe throttle saving?
                # For now, save every time for simplicity and persistence.
                self._save_session(session_id)

    async def update_wizard_inputs(
        self, 
        session_id: str, 
        style: Optional[str] = None,
        key_points: Optional[List[str]] = None
    ) -> None:
        """ウィザード入力（スタイル、キーポイント）を更新"""
        self._ensure_lock(session_id)
        async with self.locks[session_id]:
            session = self.get_session(session_id)
            if not session:
                raise ValueError(f"Session {session_id} not found")
            
            if style:
                session.interview_style = style
            if key_points is not None:
                session.user_key_points = key_points
            
            self._save_session(session_id)


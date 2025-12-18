"""
マイク音声チャンクを順序制御しながらWhisper APIで文字起こしするためのキュー管理
"""

import asyncio
import json
import logging
import re
import os
from dataclasses import dataclass
from typing import Awaitable, Callable, Dict, List, Optional

from session_manager import SessionManager
from whisper_client import whisper_client

logger = logging.getLogger(__name__)

# Constants
HOTWORDS_FILE = "backend/hotwords.json"
BASE_PROMPT = "これは日本語の会話です。インタビューを行っています。"
AIZUCHI_PATTERN = r"^(はい|ええ|うん|あ|ああ|なるほど|そうですね|ですね|なんか|ま|まぁ|あの|その|えっと)$"


@dataclass
class AudioChunk:
    """キューに積む音声チャンク"""
    base64_data: str
    mime_type: str
    speaker_id: str
    speaker_name: str
    retries: int = 0
    max_retries: int = 3

    def backoff_delay(self, base_delay: float = 1.0) -> float:
        """指数バックオフで待機時間を返す"""
        return base_delay * (2 ** max(0, self.retries - 1))


class TranscriptionManager:
    """
    セッションごとに非同期キューを持ち、音声チャンクを順番に処理する
    """

    def __init__(
        self,
        session_manager: SessionManager,
        broadcaster: Callable[[str, dict], Awaitable[None]],
        max_queue_size: int = 30,
        concurrency: int = 1,
        on_transcription_appended: Optional[Callable[[str], Awaitable[None]]] = None
    ):
        self.session_manager = session_manager
        self.broadcast = broadcaster
        self.max_queue_size = max_queue_size
        self.concurrency = concurrency
        self.on_transcription_appended = on_transcription_appended

        self.queues: Dict[str, asyncio.Queue[AudioChunk]] = {}
        self.tasks: Dict[str, list[asyncio.Task]] = {}
        self.lock = asyncio.Lock()
        self.session_locks: Dict[str, asyncio.Lock] = {}  # セッションごとのロック
        self._recent_texts: Dict[str, list[str]] = {}
        self._last_total_text: Dict[str, str] = {}
        self._last_sent_text: Dict[str, str] = {}
        
        self.hotwords = self._load_hotwords()

    def _load_hotwords(self) -> str:
        """hotwords.json から用語を読み込み、カンマ区切り文字列にする"""
        if not os.path.exists(HOTWORDS_FILE):
            # Try looking in current directory if backend/ prefix fails (e.g. running from backend dir)
            if os.path.exists("hotwords.json"):
                path = "hotwords.json"
            else:
                logger.warning("⚠️ hotwords.json not found")
                return ""
        else:
            path = HOTWORDS_FILE

        try:
            with open(path, "r", encoding="utf-8") as f:
                words = json.load(f)
                if isinstance(words, list):
                    return ", ".join(words)
        except Exception as e:
            logger.error(f"Failed to load hotwords: {e}")
        return ""

    def _construct_prompt(self, session_id: str) -> str:
        """
        Whisper APIへのプロンプトを作成
        Base Prompt + Hotwords + Recent Context
        """
        prompt_parts = [BASE_PROMPT]
        
        if self.hotwords:
            prompt_parts.append(f"用語: {self.hotwords}")

        # 直近の会話 (最大3件) をコンテキストとして追加
        recents = self._recent_texts.get(session_id, [])
        if recents:
            last_sent = self._last_sent_text.get(session_id)
            if last_sent:
                prompt_parts.append(f"直前の会話: {last_sent}")

        full_prompt = " ".join(prompt_parts)
        return full_prompt[:200]  # token数ではないが安全策

    def _filter_transcription(self, text: str) -> Optional[str]:
        """
        文字起こし結果のフィルタリング
        - 相槌 (Aizuchi) の除去
        - ハルシネーションの除去
        - Prompt Leakage (プロンプトそのものが出力される) の除去
        """
        if not text:
            return None
        
        cleaned = text.strip()
        
        # 0. Prompt Leakage Check
        if cleaned == BASE_PROMPT:
             logger.debug(f"🧹 Filtered prompt leakage: {cleaned}")
             return None

        # 1. 相槌フィルター (短い単発の相槌のみ除去)
        if re.match(AIZUCHI_PATTERN, cleaned):
            logger.debug(f"🧹 Filtered aizuchi: {cleaned}")
            return None

        # 2. ハルシネーションフィルター (繰り返し)
        if len(cleaned) > 5 and len(set(cleaned)) == 1:
             logger.debug(f"🧹 Filtered distinct char fail: {cleaned}")
             return None
             
        mid = len(cleaned) // 2
        if len(cleaned) > 10 and cleaned[:mid] == cleaned[mid:]:
             logger.debug(f"🧹 Filtered loop: {cleaned}")
             return None

        # 「ご視聴ありがとうございました」などのWhisper特有のハルシネーション
        if "ご視聴ありがとうございました" in cleaned or "チャンネル登録" in cleaned:
             logger.debug(f"🧹 Filtered youtube hallucination: {cleaned}")
             return None

        return cleaned

    @staticmethod
    def _normalize_text(text: str) -> str:
        no_ws = re.sub(r'\s+', '', (text or ''))
        return no_ws.strip().lower()

    async def enqueue_audio_chunk(
        self,
        session_id: str,
        base64_data: str,
        mime_type: str,
        speaker_id: str,
        speaker_name: str
    ) -> None:
        """音声チャンクをセッションのキューへ投入"""
        if not whisper_client.enabled:
            logger.debug("Whisper client disabled, ignoring audio chunk")
            return

        async with self.lock:
            queue = self.queues.get(session_id)
            if queue is None:
                queue = asyncio.Queue(maxsize=self.max_queue_size)
                self.queues[session_id] = queue
                self.tasks[session_id] = []
                await self._start_workers(session_id, queue)

        chunk = AudioChunk(
            base64_data=base64_data,
            mime_type=mime_type,
            speaker_id=speaker_id,
            speaker_name=speaker_name
        )

        try:
            queue.put_nowait(chunk)
        except asyncio.QueueFull:
            logger.warning("Queue is full for session %s. Dropping oldest chunk.", session_id)
            try:
                queue.get_nowait()
                queue.task_done()
                queue.put_nowait(chunk)
            except asyncio.QueueEmpty:
                logger.error("Failed to drop chunk from full queue for session %s", session_id)

    async def _requeue_chunk(self, session_id: str, chunk: AudioChunk) -> None:
        """失敗したチャンクを再度キューに積み直す"""
        async with self.lock:
            queue = self.queues.get(session_id)
            if queue is None:
                queue = asyncio.Queue(maxsize=self.max_queue_size)
                self.queues[session_id] = queue
                self.tasks[session_id] = []
                await self._start_workers(session_id, queue)

        try:
            queue.put_nowait(chunk)
        except asyncio.QueueFull:
            logger.warning(
                "Queue is full while requeueing for session %s. Dropping chunk after %d retries.",
                session_id,
                chunk.retries
            )

    async def _start_workers(self, session_id: str, queue: asyncio.Queue[AudioChunk]) -> None:
        """指定セッション用のワーカーを起動"""
        for _ in range(self.concurrency):
            task = asyncio.create_task(self._worker_loop(session_id, queue))
            self.tasks[session_id].append(task)
            logger.info("Started transcription worker for %s", session_id)

    async def _worker_loop(self, session_id: str, queue: asyncio.Queue[AudioChunk]) -> None:
        """キューから音声チャンクを取り出して処理"""
        while True:
            try:
                chunk = await queue.get()
            except asyncio.CancelledError:
                break
            try:
                await self._process_chunk(session_id, chunk)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.error(f"Transcription worker error for {session_id}: {exc}")
            finally:
                queue.task_done()

    def _get_session_lock(self, session_id: str) -> asyncio.Lock:
        """セッションごとのロックを取得"""
        if session_id not in self.session_locks:
            self.session_locks[session_id] = asyncio.Lock()
        return self.session_locks[session_id]

    async def _process_chunk(self, session_id: str, chunk: AudioChunk) -> None:
        """チャンクをWhisperに投げて結果を保存"""
        # セッションごとにロックを取得して、チャンク処理を完全にシリアル化
        async with self._get_session_lock(session_id):
            logger.info("🔒 Lock acquired for %s, processing chunk", session_id)
            await self.__process_chunk_locked(session_id, chunk)
            logger.info("🔓 Lock released for %s", session_id)

    async def __process_chunk_locked(self, session_id: str, chunk: AudioChunk) -> None:
        """ロック取得後の実際の処理"""
        try:
            prompt = self._construct_prompt(session_id)
            logger.debug(f"🎤 Using prompt for {session_id}: {prompt}")
            
            transcription = await whisper_client.transcribe_audio_chunk(
                audio_base64=chunk.base64_data,
                mime_type=chunk.mime_type,
                prompt=prompt
            )
        except Exception as exc:
            chunk.retries += 1
            if chunk.retries <= chunk.max_retries:
                delay = chunk.backoff_delay()
                logger.warning(
                    "Transcription failed for %s (retry %d/%d): %s. Retrying in %.1fs",
                    session_id,
                    chunk.retries,
                    chunk.max_retries,
                    exc,
                    delay
                )
                await asyncio.sleep(delay)
                await self._requeue_chunk(session_id, chunk)
                return

            logger.error(
                "Transcription permanently failed for %s after %d retries: %s",
                session_id,
                chunk.max_retries,
                exc
            )
            return

        if not transcription:
            logger.debug("No transcription result for session %s (likely silence)", session_id)
            return

        normalized = transcription.strip()
        if not normalized:
            logger.debug("Empty transcription for %s", session_id)
            return

        prev_total = self._last_total_text.get(session_id)
        new_text = normalized
        
        logger.info("🔍 Processing transcription for %s:", session_id)
        logger.info("   Full text from Whisper: '%s'", normalized[:100])
        logger.info("   Previous cumulative: '%s'", (prev_total[:100] if prev_total else 'None'))
        
        if prev_total and len(normalized) > len(prev_total) and normalized.startswith(prev_total):
            new_text = normalized[len(prev_total):].lstrip()
            logger.info("   ✂️ Extracted diff only: '%s'", new_text[:100])
        elif prev_total and normalized == prev_total:
            logger.info("   ❌ Identical to previous cumulative, skipping")
            return

        last_sent = self._last_sent_text.get(session_id)
        logger.info("   Last sent text: '%s'", (last_sent[:100] if last_sent else 'None'))
        
        if last_sent and last_sent == new_text.strip():
            logger.info("   ❌ Identical to last sent, skipping")
            self._last_total_text[session_id] = normalized
            return

        norm_key = self._normalize_text(new_text)
        logger.info("   Normalized key: '%s'", norm_key[:100])
        
        if not norm_key:
            logger.info("   ❌ Empty after normalization, skipping")
            self._last_total_text[session_id] = normalized
            return

        # 元のテキスト（正規化前）も比較
        recent_list = self._recent_texts.setdefault(session_id, [])
        logger.info("   Recent keys count: %d", len(recent_list))
        
        if norm_key in recent_list:
            logger.info("   ❌ Found in recent 10 (normalized), skipping")
            self._last_total_text[session_id] = normalized
            return
        
        # 念のため、元のテキストも直近3件と完全一致チェック
        for prev_key in recent_list[-3:]:
            if prev_key == norm_key:
                logger.info("   ❌ Exact match in recent 3, skipping")
                self._last_total_text[session_id] = normalized
                return

        # フィルタリング実行
        filtered_text = self._filter_transcription(new_text)
        if not filtered_text:
            logger.info(f"   🧹 Filtered out text: '{new_text}'")
            self._last_total_text[session_id] = normalized
            return

        utterance = await self.session_manager.add_transcription_text(
            session_id=session_id,
            text=filtered_text,  # フィルタ済みのテキストを使用
            speaker_id=chunk.speaker_id,
            speaker_name=chunk.speaker_name
        )

        self._last_total_text[session_id] = normalized

        if not utterance:
            logger.debug("🔄 Duplicate or empty transcription skipped by session_manager for %s", session_id)
            return

        recent_list.append(norm_key)
        if len(recent_list) > 10:
            del recent_list[0]
        self._last_sent_text[session_id] = filtered_text.strip()
        
        logger.info("✅ Added transcription for %s: '%s...' (%d chars)", 
                   session_id, filtered_text[:30], len(filtered_text))

        # セッション情報を再取得してAIカウンターを取得
        session = self.session_manager.get_session(session_id)

        await self.broadcast(session_id, {
            'type': 'utterance_added',
            'data': utterance.model_dump()
        })

        # AIカウンター更新をブロードキャスト
        if session:
            await self.broadcast(session_id, {
                'type': 'ai_counters_updated',
                'data': {
                    'pending_article_count': getattr(session, 'pending_ai_article_count', 0),
                    'pending_question_count': getattr(session, 'pending_ai_question_count', 0)
                }
            })

        if self.on_transcription_appended:
            logger.info("🔔 Triggering AI processing callback for %s", session_id)
            # タスクを作成してエラーハンドリングを追加
            task = asyncio.create_task(self._notify_transcription_appended(session_id))
            # タスクのエラーを確実にキャッチ
            task.add_done_callback(lambda t: self._handle_task_exception(t, session_id))
        else:
            logger.warning("⚠️ No AI processing callback registered!")

    def _handle_task_exception(self, task: asyncio.Task, session_id: str) -> None:
        """非同期タスクの例外を処理"""
        try:
            task.result()
        except Exception as exc:
            logger.error(
                "❌❌❌ CRITICAL: Unhandled exception in AI processing task for %s: %s",
                session_id,
                exc,
                exc_info=True
            )

    async def _notify_transcription_appended(self, session_id: str) -> None:
        """文字起こし追記後のフックを非同期で実行"""
        if not self.on_transcription_appended:
            logger.warning("⚠️ on_transcription_appended is None in _notify_transcription_appended")
            return

        try:
            logger.info("🎯 Calling AI processing callback for %s", session_id)
            await self.on_transcription_appended(session_id)
            logger.info("✅ AI processing callback completed for %s", session_id)
        except Exception as exc:
            logger.error(
                "❌ Error in on_transcription_appended callback for %s: %s",
                session_id,
                exc,
                exc_info=True
            )
            # エラーを再スローして、add_done_callbackでもキャッチされるようにする
            raise

    @property
    def enabled(self) -> bool:
        return whisper_client.enabled

    async def stop_for_session(self, session_id: str) -> None:
        """セッション単位でワーカーを停止し、キューを空にする"""
        async with self.lock:
            tasks = self.tasks.pop(session_id, [])
            for task in tasks:
                task.cancel()
            queue = self.queues.pop(session_id, None)
            self._recent_texts.pop(session_id, None)
            self._last_total_text.pop(session_id, None)
            self._last_sent_text.pop(session_id, None)
            self.session_locks.pop(session_id, None)

        for task in tasks:
            try:
                await task
            except asyncio.CancelledError:
                pass
        if queue:
            while not queue.empty():
                queue.get_nowait()
                queue.task_done()

        logger.info("Stopped transcription workers for %s", session_id)

    async def shutdown(self) -> None:
        """全セッションのワーカーを停止"""
        async with self.lock:
            session_ids = list(self.tasks.keys())

        for session_id in session_ids:
            await self.stop_for_session(session_id)


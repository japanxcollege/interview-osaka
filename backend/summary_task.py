"""
3分ごとの要約タスク
バックグラウンドで定期的に要約を生成
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Dict, List

from session_manager import SessionManager
from models import InterviewSession, Utterance
from gemini_client import gemini_client
from websocket_handler import manager as ws_manager

logger = logging.getLogger(__name__)


class SummaryTask:
    """3分ごとの要約バックグラウンドタスク"""

    def __init__(self, session_manager: SessionManager, interval: int = 180):
        """
        Args:
            session_manager: SessionManagerインスタンス
            interval: 要約実行間隔（秒）デフォルト180秒（3分）
        """
        self.session_manager = session_manager
        self.interval = interval
        self.tasks: Dict[str, asyncio.Task] = {}
        self.processing_locks: Dict[str, asyncio.Lock] = {}

    async def start_for_session(self, session_id: str):
        """
        セッションの要約タスクを開始

        Args:
            session_id: セッションID
        """
        if session_id in self.tasks:
            logger.warning(f"Summary task already running for {session_id}")
            return

        task = asyncio.create_task(self._run_summary_loop(session_id))
        self.tasks[session_id] = task
        logger.info(f"📊 Started summary task for {session_id}")

    async def stop_for_session(self, session_id: str):
        """
        セッションの要約タスクを停止

        Args:
            session_id: セッションID
        """
        if session_id not in self.tasks:
            return

        task = self.tasks[session_id]
        task.cancel()
        del self.tasks[session_id]
        logger.info(f"🛑 Stopped summary task for {session_id}")

    async def _run_summary_loop(self, session_id: str):
        """
        要約ループ

        Args:
            session_id: セッションID
        """
        try:
            while True:
                await asyncio.sleep(self.interval)

                session = self.session_manager.get_session(session_id)
                if not session:
                    logger.warning(f"Session {session_id} not found, stopping task")
                    break

                # 録音中のセッションのみ処理
                if session.status != 'recording':
                    logger.debug(f"Session {session_id} is not recording, skipping")
                    continue

                await self._aggregate_and_summarize(session_id)

        except asyncio.CancelledError:
            logger.info(f"Summary task cancelled for {session_id}")
        except Exception as e:
            logger.error(f"Error in summary loop for {session_id}: {e}")

    async def _aggregate_and_summarize(self, session_id: str):
        """
        3分ごとの集約と要約処理

        処理内容:
        1. 直近3分の発話を recent_transcript に移動
        2. 古い発話を要約して front_summary に追加
        3. AI質問提案を生成
        """
        try:
            session = self.session_manager.get_session(session_id)
            if not session:
                return

            # 発話が少ない場合はスキップ
            if len(session.transcript) < 3:
                logger.debug(f"Not enough utterances for {session_id}, skipping")
                return

            # 現在時刻から3分前を計算
            three_minutes_ago = datetime.now() - timedelta(minutes=3)

            # 直近3分の発話を抽出
            recent = []
            old = []

            for utterance in session.transcript:
                utterance_time = datetime.fromisoformat(utterance.timestamp)
                if utterance_time >= three_minutes_ago:
                    recent.append(utterance)
                else:
                    old.append(utterance)

            logger.info(
                f"📊 Aggregating: {len(old)} old, {len(recent)} recent utterances"
            )

            # 古い発話を要約（まだ要約されていない場合）
            if old and not session.front_summary:
                if gemini_client.enabled:
                    summary = await gemini_client.summarize_transcript(old)
                    if summary:
                        await self.session_manager.update_summary(
                            session_id,
                            front_summary=summary
                        )

                        # WebSocketでブロードキャスト
                        await ws_manager.broadcast(session_id, {
                            'type': 'summary_updated',
                            'data': {'front_summary': summary}
                        })

                        await ws_manager.broadcast(session_id, {
                            'type': 'ai_status_update',
                            'data': {
                                'target': 'summary',
                                'status': 'completed',
                                'message': '要約を更新しました'
                            }
                        })

                        logger.info(f"📝 Generated front summary: {len(summary)} chars")

            # recent_transcript を更新
            await self.session_manager.update_recent_transcript(
                session_id,
                recent
            )

            await self._maybe_suggest_question(session_id, session, recent)

            await self._maybe_generate_article_section(session_id, session)

        except Exception as e:
            logger.error(f"Failed to aggregate and summarize: {e}")

    async def _maybe_generate_article_section(
        self,
        session_id: str,
        session: InterviewSession
    ):
        """文字起こしが一定数溜まったら原稿セクションを生成"""
        if not gemini_client.enabled:
            logger.warning("⚠️ Gemini client is disabled, skipping article generation for %s", session_id)
            return

        pending = getattr(session, "pending_ai_article_count", 0) or 0
        
        logger.info("📝 Article generation check: pending=%d", pending)
        
        if pending < 10:
            logger.debug("No article generation needed (pending < 10)")
            return
        
        # 一度に1回だけ処理（10件分）
        loop_count = 1

        last_index = getattr(session, "last_article_transcript_index", 0) or 0
        logger.info("📝 Starting article generation: last_index=%d, total_transcripts=%d", 
                   last_index, len(session.transcript))

            await ws_manager.broadcast(session_id, {
                'type': 'ai_status_update',
                'data': {
                    'target': 'article',
                    'status': 'processing',
                    'message': '文字起こしを解析中...'
                }
            })

            for _ in range(loop_count):
                total_transcripts = len(session.transcript)
                # 10件分の発話を取得
                new_utterances = session.transcript[last_index:min(last_index + 10, total_transcripts)]
                if not new_utterances:
                    break

                try:
                    await ws_manager.broadcast(session_id, {
                        'type': 'ai_status_update',
                        'data': {
                            'target': 'article',
                            'status': 'processing',
                            'message': '原稿セクションを執筆中...'
                        }
                    })

                    article_section = await gemini_client.generate_article_section(
                        current_article=session.article_draft.text,
                        recent_transcript=new_utterances,
                        front_summary=session.front_summary or ""
                    )

                    if not article_section:
                        logger.warning("⚠️ Gemini failed, using fallback section for %s", session_id)
                        article_section = self._build_fallback_section(new_utterances)
                    else:
                        logger.info("✅ Gemini generated article section for %s (%d chars)", session_id, len(article_section))

                    new_last_index = last_index + len(new_utterances)
                    
                    article = await self.session_manager.append_article_section(
                        session_id=session_id,
                        section_text=article_section,
                        transcript_count=new_last_index
                    )

                    pending -= 10
                    await self.session_manager.reset_ai_counters(
                        session_id,
                        article_count=pending,
                        question_count=None
                    )
                    
                    # セッションを再取得して最新のlast_article_transcript_indexを取得
                    session = self.session_manager.get_session(session_id)
                    last_index = getattr(session, "last_article_transcript_index", 0) or 0
                    
                    logger.debug("📝 Updated last_index to %d after article generation", last_index)

                    await ws_manager.broadcast(session_id, {
                        'type': 'article_updated',
                        'data': {
                            'text': article.text,
                            'last_updated': article.last_updated
                        }
                    })

                    # AIカウンター更新をブロードキャスト
                    if session:
                        await ws_manager.broadcast(session_id, {
                            'type': 'ai_counters_updated',
                            'data': {
                                'pending_article_count': pending,
                                'pending_question_count': getattr(session, 'pending_ai_question_count', 0)
                            }
                        })
                    
                    await ws_manager.broadcast(session_id, {
                        'type': 'ai_status_update',
                        'data': {
                            'target': 'article',
                            'status': 'completed',
                            'message': '原稿が追加されました'
                        }
                    })

                    logger.info(
                        "📰 Appended article section for %s (utterances=%d, remaining pending=%d)",
                        session_id,
                        len(new_utterances),
                        pending
                    )
                except Exception as e:
                    logger.error(f"Error in article generation: {e}")
                    await ws_manager.broadcast(session_id, {
                        'type': 'ai_status_update',
                        'data': {
                            'target': 'article',
                            'status': 'error',
                            'message': f'エラー: {str(e)}'
                        }
                    })
                    break


    def _build_fallback_section(self, utterances: List[Utterance]) -> str:
        """Geminiが失敗した場合のフォールバック: 発話から小見出しと本文を生成"""
        # 最初の発話から小見出しを生成
        title_source = utterances[0].text.strip() if utterances else ""
        # 先頭30文字を切り取り、句読点を除去して小見出しに
        safe_title = title_source[:30].replace('\n', ' ').strip('。.!?、,') or "追加セクション"
        
        # 全発話を自然な文章に結合
        body_parts = []
        for u in utterances:
            text = u.text.strip()
            if text:
                # インタビュアーの発言は引用符で囲む、インタビュイーはそのまま
                if "interviewer" in u.speaker_id.lower():
                    body_parts.append(f'「{text}」')
                else:
                    body_parts.append(text)
        
        body = ''.join(body_parts) if body_parts else "(内容なし)"
        
        return f"## {safe_title}\n\n{body}"

    async def _maybe_suggest_question(
        self,
        session_id: str,
        session: InterviewSession,
        candidate_utterances: List[Utterance]
    ):
        """直近の発話からAI質問提案を生成"""
        if not gemini_client.enabled:
            return

        if len(candidate_utterances) < 3:
            return

        pending = getattr(session, "pending_ai_question_count", 0) or 0
        
        if pending < 5:
            return

        await ws_manager.broadcast(session_id, {
            'type': 'ai_status_update',
            'data': {
                'target': 'question',
                'status': 'processing',
                'message': '次の質問を検討中...'
            }
        })
        
        # 一度に1回だけ処理（5件分）
        loop_count = 1

        for _ in range(loop_count):
            try:
                question = await gemini_client.suggest_question(
                    front_summary=session.front_summary or "",
                    recent_transcript=candidate_utterances,
                    previous_questions=session.suggested_questions[-5:]
                )

                if not question:
                    await ws_manager.broadcast(session_id, {
                        'type': 'ai_status_update',
                        'data': {
                            'target': 'question',
                            'status': 'error',
                            'message': '質問案の生成に失敗しました'
                        }
                    })
                    break

                trimmed_question = question.strip()
                existing_trimmed = {q.strip() for q in session.suggested_questions}
                if trimmed_question in existing_trimmed:
                    logger.debug(
                        "Skipping duplicate question suggestion for %s: %s",
                        session_id,
                        trimmed_question
                    )
                    await ws_manager.broadcast(session_id, {
                        'type': 'ai_status_update',
                        'data': {
                            'target': 'question',
                            'status': 'idle',
                            'message': ''
                        }
                    })
                    break

                await self.session_manager.add_suggested_question(
                    session_id,
                    question,
                    transcript_count=len(session.transcript)
                )

                pending -= 5
                await self.session_manager.reset_ai_counters(
                    session_id,
                    article_count=None,
                    question_count=pending
                )

                await ws_manager.broadcast(session_id, {
                    'type': 'question_suggested',
                    'data': {'question': question}
                })

                # AIカウンター更新をブロードキャスト
                session = self.session_manager.get_session(session_id)
                if session:
                    await ws_manager.broadcast(session_id, {
                        'type': 'ai_counters_updated',
                        'data': {
                            'pending_article_count': getattr(session, 'pending_ai_article_count', 0),
                            'pending_question_count': pending
                        }
                    })

                await ws_manager.broadcast(session_id, {
                    'type': 'ai_status_update',
                    'data': {
                        'target': 'question',
                        'status': 'completed',
                        'message': '新しい質問を提案しました'
                    }
                })

                logger.info(f"💡 Suggested question: {question[:50]}...")

                if pending < 5:
                    break
            except Exception as e:
                logger.error(f"Error suggesting question: {e}")
                await ws_manager.broadcast(session_id, {
                    'type': 'ai_status_update',
                    'data': {
                        'target': 'question',
                        'status': 'error',
                        'message': f'エラー: {str(e)}'
                    }
                })
                break

    def _ensure_processing_lock(self, session_id: str):
        if session_id not in self.processing_locks:
            self.processing_locks[session_id] = asyncio.Lock()

    async def process_transcript_update(self, session_id: str):
        """文字起こし追加直後にAI処理をトリガー"""
        logger.info("🚀 process_transcript_update CALLED for %s", session_id)
        self._ensure_processing_lock(session_id)

        async with self.processing_locks[session_id]:
            session = self.session_manager.get_session(session_id)
            if not session:
                logger.warning("⚠️ Session %s not found for AI processing", session_id)
                return

            total_transcripts = len(session.transcript)
            pending_article = getattr(session, "pending_ai_article_count", 0) or 0
            pending_question = getattr(session, "pending_ai_question_count", 0) or 0
            
            logger.info("🤖 AI processing triggered for %s: total=%d, pending_article=%d, pending_question=%d",
                       session_id, total_transcripts, pending_article, pending_question)

            # 文字起こし追記で recent_transcript は自動更新されている
            candidates = list(session.recent_transcript[-5:])

            logger.info("📋 Calling _maybe_suggest_question...")
            await self._maybe_suggest_question(session_id, session, candidates)
            logger.info("📋 Calling _maybe_generate_article_section...")
            await self._maybe_generate_article_section(session_id, session)
            logger.info("✅ process_transcript_update COMPLETED for %s", session_id)


# グローバルインスタンス
summary_task = None


def get_summary_task(session_manager: SessionManager) -> SummaryTask:
    """SummaryTaskのグローバルインスタンスを取得"""
    global summary_task
    if summary_task is None:
        summary_task = SummaryTask(session_manager)
    return summary_task

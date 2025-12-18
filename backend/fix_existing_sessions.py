#!/usr/bin/env python3
"""
既存セッションに対してAI処理を実行するスクリプト

使い方:
    python3 fix_existing_sessions.py <session_id>
"""

import asyncio
import sys
import logging
from pathlib import Path

# ログ設定
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# プロジェクトのルートをパスに追加
sys.path.insert(0, str(Path(__file__).resolve().parent))

from session_manager import SessionManager
from summary_task import get_summary_task


async def process_existing_session(session_id: str):
    """既存セッションに対してAI処理を実行"""
    
    session_manager = SessionManager()
    summary_task_manager = get_summary_task(session_manager)
    
    # セッションを取得
    session = session_manager.get_session(session_id)
    if not session:
        logger.error(f"❌ Session {session_id} not found")
        return
    
    logger.info(f"📋 Session: {session.title}")
    logger.info(f"📊 Transcript count: {len(session.transcript)}")
    logger.info(f"📊 Pending article count: {session.pending_ai_article_count}")
    logger.info(f"📊 Pending question count: {session.pending_ai_question_count}")
    logger.info(f"📊 Last article index: {session.last_article_transcript_index}")
    logger.info(f"📊 Article length: {len(session.article_draft.text)}")
    
    # AI処理を実行
    logger.info("🚀 Starting AI processing...")
    
    try:
        # 複数回実行（10件ごとに処理）
        max_iterations = (session.pending_ai_article_count // 10) + 1
        logger.info(f"🔄 Will process up to {max_iterations} iterations")
        
        for i in range(max_iterations):
            logger.info(f"\n{'='*60}")
            logger.info(f"🔄 Iteration {i+1}/{max_iterations}")
            logger.info(f"{'='*60}")
            
            # セッションを再取得（最新の状態を取得）
            session = session_manager.get_session(session_id)
            if not session:
                break
            
            pending = getattr(session, "pending_ai_article_count", 0) or 0
            logger.info(f"📊 Current pending: {pending}")
            
            if pending < 10:
                logger.info("✅ No more pending items (< 10)")
                break
            
            # AI処理を実行
            await summary_task_manager.process_transcript_update(session_id)
            
            # 少し待機（データベース保存の時間を確保）
            await asyncio.sleep(1)
        
        # 最終結果を表示
        session = session_manager.get_session(session_id)
        logger.info(f"\n{'='*60}")
        logger.info("✅ Processing completed!")
        logger.info(f"{'='*60}")
        logger.info(f"📊 Final pending article count: {session.pending_ai_article_count}")
        logger.info(f"📊 Final last article index: {session.last_article_transcript_index}")
        logger.info(f"📊 Final article length: {len(session.article_draft.text)}")
        logger.info(f"📊 Suggested questions: {len(session.suggested_questions)}")
        
    except Exception as e:
        logger.error(f"❌ Error during processing: {e}", exc_info=True)


async def main():
    if len(sys.argv) < 2:
        print("Usage: python3 fix_existing_sessions.py <session_id>")
        print("\nAvailable sessions:")
        
        # セッション一覧を表示
        data_dir = Path("data/sessions")
        if data_dir.exists():
            for session_file in sorted(data_dir.glob("session_*.json"), reverse=True):
                session_id = session_file.stem
                print(f"  - {session_id}")
        
        sys.exit(1)
    
    session_id = sys.argv[1]
    await process_existing_session(session_id)


if __name__ == "__main__":
    asyncio.run(main())











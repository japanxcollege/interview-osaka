"""
FastAPI Main Application
Interview Editor API - Whisper Integration
"""

import os
import shutil
from pathlib import Path
from fastapi import FastAPI, WebSocket, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging
import asyncio
from dotenv import load_dotenv
from pydantic import BaseModel

from models import CreateSessionRequest, InterviewSession, UpdateArticleRequest, AddNoteRequest, ArticleDraft
from session_manager import SessionManager
from websocket_handler import handle_websocket, manager as ws_manager
from summary_task import get_summary_task
from transcription_manager import TranscriptionManager
from settings_manager import settings_manager
from style_manager import style_manager, PromptStyle
from whisper_client import whisper_client
from ai_editor import ai_editor

# 環境変数読み込み
BASE_DIR = Path(__file__).resolve().parents[1]
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

load_dotenv()  # 既定のパス（カレントディレクトリ）
load_dotenv(dotenv_path=BASE_DIR / ".env", override=False)

# ログ設定
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# グローバル変数
session_manager = SessionManager()
summary_task_manager = get_summary_task(session_manager)
transcription_manager = TranscriptionManager(
    session_manager,
    ws_manager.broadcast,
    on_transcription_appended=summary_task_manager.process_transcript_update
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """アプリケーションのライフサイクル管理"""
    logger.info("🚀 Interview Editor API - Whisper Integration starting...")

    yield

    logger.info("👋 Interview Editor API shutting down...")

    # Summary Task のタスクをキャンセル
    for session_id in list(summary_task_manager.tasks.keys()):
        await summary_task_manager.stop_for_session(session_id)

    # Transcriptionキューを停止
    await transcription_manager.shutdown()


# FastAPIアプリケーション
app = FastAPI(
    title="Interview Editor API",
    version="2.0.0 (Whisper Integration)",
    description="リアルタイムインタビューエディター - Whisper API統合",
    lifespan=lifespan
)

# CORS設定（フロントエンドからのアクセスを許可）
# 環境変数から許可するオリジンを取得
allowed_origins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    "http://localhost:3003",
    "https://interview-editor-frontend.vercel.app",
    "https://interview-editor-frontend-3z0c3opcb-jxcs-projects-579395f6.vercel.app"
]

# VercelのURLが環境変数で設定されている場合は追加
frontend_url = os.getenv("FRONTEND_URL", "").rstrip("/")
if frontend_url:
    allowed_origins.append(frontend_url)
    logger.info(f"✅ Added CORS origin: {frontend_url}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Debug: Allow all to rule out CORS config
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_headers=["*"],
)

# Debug
from debug_router import router as debug_router
app.include_router(debug_router)


# REST API エンドポイント

@app.get("/")
async def root():
    """ヘルスチェック"""
    return {
        "status": "ok",
        "message": "Interview Editor API",
        "version": "2.0.0 (Whisper Integration)",
        "features": {
            "whisper_api": bool(os.getenv("OPENAI_API_KEY")),
            "gemini_api": bool(os.getenv("GEMINI_API_KEY"))
        }
    }


class SettingsUpdate(BaseModel):
    openai_api_key: str
    whisper_provider: str
    whisper_model: str
    whisper_language: str = "ja"

class AIEditRequest(BaseModel):
    instruction: str
    selected_text: str = ""
    context: str = ""
    model_provider: str = "gemini"

@app.get("/api/settings")
async def get_settings():
    """現在の設定を取得"""
    return settings_manager.get_settings()


@app.post("/api/settings")
async def update_settings(settings: SettingsUpdate):
    """設定を更新"""
    settings_manager.update_settings(settings.model_dump())
    whisper_client.reload_config()
    logger.info("✅ Settings updated via API")
    return {"status": "ok", "settings": settings_manager.get_settings()}


async def process_uploaded_file(session_id: str, file_path: Path, prompt: str):
    """バックグラウンドでファイル文字起こし処理"""
    logger.info(f"🚀 Start processing file for session {session_id}: {file_path}")
    try:
        await session_manager.update_upload_progress(session_id, 10)
        
        # Transcribe (Blocking)
        logger.info(f"🎙 Call whisper_client.transcribe_file for {session_id}")
        text = await whisper_client.transcribe_file(str(file_path), prompt)
        
        await session_manager.update_upload_progress(session_id, 90)

        if text:
            utterance = await session_manager.add_transcription_text(session_id, text, "Speaker", "AudioFile")
            if utterance:
                 # Broadcast update
                 await ws_manager.broadcast(session_id, {
                    "type": "transcript_update",
                    "utterance": utterance.dict()
                 })
            logger.info(f"✅ File transcription completed for {session_id}")
        else:
            logger.warning(f"⚠️ No text transcribed for {session_id} (text is None/Empty)")
            
        await session_manager.update_upload_progress(session_id, 100)
            
    except Exception as e:
        logger.error(f"❌ Error processing file {session_id}: {e}", exc_info=True)
        await session_manager.update_upload_progress(session_id, -1) # Error state
    finally:
        # Cleanup
        if file_path.exists():
            file_path.unlink()
            logger.info(f"🧹 Cleaned up file {file_path}")


@app.post("/api/sessions/upload")
async def upload_session(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: str = Form(""),
    prompt: str = Form(""),
    style: str = Form("qa"),
    hotwords: str = Form("") # Comma separated
):
    """
    音声ファイルをアップロードしてセッション作成＆文字起こし開始
    """
    logger.info(f"📥 Received upload request: {file.filename}, title={title}")
    
    if not title:
        title = file.filename or "Uploaded Audio"

    # Create session
    session = session_manager.create_session(title)
    
    # Initial save of wizard inputs
    await session_manager.update_wizard_inputs(
        session.session_id, 
        style=style
    )
    
    # Save file temporarily (Thread Pool to avoid blocking)
    file_path = UPLOAD_DIR / f"{session.session_id}_{file.filename}"
    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _save_upload_file_sync, file.file, file_path)
        logger.info(f"💾 File saved to {file_path}")
    except Exception as e:
        logger.error(f"Failed to save uploaded file: {e}")
        raise HTTPException(status_code=500, detail="File save failed")

    # Combine user prompt and hotwords
    full_prompt = prompt
    if hotwords:
        full_prompt = f"{prompt} Hotwords: {hotwords}"

    # Start background task
    background_tasks.add_task(process_uploaded_file, session.session_id, file_path, full_prompt)

    return session


@app.post("/api/sessions/{session_id}/import")
async def import_file_to_session(
    session_id: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    prompt: str = Form("")
):
    """既存セッションに音声ファイルをインポートして追記"""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    file_path = UPLOAD_DIR / f"{session.session_id}_{file.filename}"
    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _save_upload_file_sync, file.file, file_path)
    except Exception as e:
        logger.error(f"Failed to save imported file: {e}")
        raise HTTPException(status_code=500, detail="File save failed")

    background_tasks.add_task(process_uploaded_file, session.session_id, file_path, prompt)
    return {"status": "importing", "filename": file.filename}

def _save_upload_file_sync(file_obj, path: Path):
    with open(path, "wb") as buffer:
        shutil.copyfileobj(file_obj, buffer)

class WizardUpdate(BaseModel):
    key_points: list[str] = []

@app.put("/api/sessions/{session_id}/wizard")
async def update_wizard(session_id: str, data: WizardUpdate):
    """ウィザード入力（キーポイント）更新"""
    try:
        await session_manager.update_wizard_inputs(session_id, key_points=data.key_points)
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Wizard update failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/sessions/{session_id}/generate")
async def generate_draft(session_id: str):
    """記事ドラフト生成 (Phase 3)"""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    full_transcript = "\n".join([f"{u.speaker_name}: {u.text}" for u in session.transcript])
    if not full_transcript:
         # もし文字起こしがまだならエラー
         raise HTTPException(status_code=400, detail="Transcription not ready")

    draft_text = await ai_editor.generate_draft_from_transcript(
        transcript_text=full_transcript,
        style=session.interview_style,
        key_points=session.user_key_points,
        model_provider="gemini" # Default or from session?
    )
    
    if draft_text:
        await session_manager.update_article(session_id, draft_text)
        return {"status": "ok", "text": draft_text}
    else:
        raise HTTPException(status_code=500, detail="Generation failed")



@app.post("/api/ai/edit")
async def ai_edit(request: AIEditRequest):
    """AIによるテキスト編集・生成"""
    try:
        result = await ai_editor.edit_text(
            instruction=request.instruction,
            selected_text=request.selected_text,
            context=request.context,
            model_provider=request.model_provider
        )
        if not result:
             raise HTTPException(status_code=500, detail="AI generation failed")
             
        return {"text": result}
    except Exception as e:
        logger.error(f"AI edit error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/sessions", response_model=list[InterviewSession])
async def list_sessions():
    """セッション一覧取得"""
    return session_manager.list_sessions()


@app.post("/api/sessions", response_model=InterviewSession)
async def create_session(request: CreateSessionRequest):
    """
    セッション作成

    - **title**: セッションのタイトル
    """
    session = session_manager.create_session(
        title=request.title,
        discord_channel_id=None  # Discord非依存
    )
    logger.info(f"✅ Created session: {session.session_id}")
    return session
# --- Style Management API ---
@app.get("/api/styles")
async def get_styles():
    return style_manager.get_all()

@app.post("/api/styles")
async def create_style(style: PromptStyle):
    try:
        style_manager.add_style(style)
        return style
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.put("/api/styles/{style_id}")
async def update_style(style_id: str, updates: dict):
    try:
        updated = style_manager.update_style(style_id, updates)
        return updated
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@app.delete("/api/styles/{style_id}")
async def delete_style(style_id: str):
    style_manager.delete_style(style_id)
    return {"status": "deleted"}


@app.get("/api/sessions/{session_id}", response_model=InterviewSession)
async def get_session(session_id: str):
    """セッション詳細取得"""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@app.put("/api/sessions/{session_id}/draft")
async def update_draft(session_id: str, request: UpdateArticleRequest):
    """記事原稿の更新"""
    try:
        await session_manager.update_article(session_id, request.text)
        session = session_manager.get_session(session_id)
        return session
    except Exception as e:
        logger.error(f"Failed to update draft: {e}")
        raise HTTPException(status_code=500, detail="Update failed")


@app.post("/api/sessions/{session_id}/drafts/generate")
async def generate_draft_endpoint(session_id: str, request: dict):
    """新しいドラフトを生成"""
    style_id = request.get("style_id", "qa")
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Get style
    style = style_manager.get_style(style_id)
    instruction = style.instruction if style else "..."
    style_name = style.name if style else style_id

    # Generate
    try:
        text = await ai_editor.generate_draft_from_transcript(session.transcript, instruction)
    except Exception as e:
        logger.error(f"Generation failed: {e}")
        raise HTTPException(status_code=500, detail="AI Generation failed")

    # Create Draft
    from datetime import datetime
    new_draft = ArticleDraft(
        draft_id=f"draft_{int(datetime.now().timestamp())}",
        name=f"{style_name} ({datetime.now().strftime('%H:%M')})",
        style_id=style_id,
        text=text,
        last_updated=datetime.now().isoformat()
    )

    await session_manager.add_draft(session_id, new_draft)
    await session_manager.switch_draft(session_id, new_draft.draft_id)

    # Broadcast
    updated_session = session_manager.get_session(session_id)
    await ws_manager.broadcast(session_id, {"type": "initial_data", "data": updated_session.dict()})
    
    return updated_session

@app.put("/api/sessions/{session_id}/drafts/switch")
async def switch_draft_endpoint(session_id: str, request: dict):
    """ドラフト切り替え"""
    draft_id = request.get("draft_id")
    updated_draft = await session_manager.switch_draft(session_id, draft_id)
    if not updated_draft:
        raise HTTPException(status_code=404, detail="Draft not found")

    updated_session = session_manager.get_session(session_id)
    await ws_manager.broadcast(session_id, {"type": "initial_data", "data": updated_session.dict()})
    return updated_session


@app.post("/api/sessions/{session_id}/notes")
async def add_note(session_id: str, note: AddNoteRequest):
    """メモ追加"""
    try:
        added_note = await session_manager.add_note(session_id, note.text)
        return added_note
    except Exception as e:
        logger.error(f"Failed to add note: {e}")
        raise HTTPException(status_code=500, detail="Failed to add note")


@app.post("/api/sessions/{session_id}/start-recording")
async def start_recording(session_id: str):
    """
    録音開始

    Whisper API統合: フロントエンドから音声データを受信して処理
    """
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # ステータスを録音中に変更
    await session_manager.update_status(session_id, 'recording')

    # 3分要約タスクを開始
    await summary_task_manager.start_for_session(session_id)

    logger.info(f"🎤 Started recording for {session_id} (Whisper API)")

    return {"status": "recording", "session_id": session_id}


@app.post("/api/sessions/{session_id}/stop-recording")
async def stop_recording(session_id: str):
    """録音停止"""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # ステータスを編集中に変更
    await session_manager.update_status(session_id, 'editing')

    # 3分要約タスクを停止
    await summary_task_manager.stop_for_session(session_id)

    # 音声キューを停止
    await transcription_manager.stop_for_session(session_id)

    logger.info(f"🛑 Stopped recording for {session_id}")

    return {"status": "editing", "session_id": session_id}


# WebSocket エンドポイント

@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    """
    WebSocket接続

    - リアルタイムデータ同期
    - 原稿編集、メモ追加
    - 音声データの受信とWhisper API処理
    - 文字起こし結果の送信
    """
    await handle_websocket(websocket, session_id, session_manager, transcription_manager)


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", os.getenv("BACKEND_PORT", "8005")))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=True,
        log_level="info"
    )

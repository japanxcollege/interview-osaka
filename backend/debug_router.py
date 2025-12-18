from fastapi import APIRouter
from main import session_manager

router = APIRouter()

@router.get("/api/debug/sessions/{session_id}")
async def debug_session(session_id: str):
    session = session_manager.get_session(session_id)
    if not session:
        return {"error": "Session not found"}
    
    return {
        "status": session.status,
        "transcript_count": len(session.transcript),
        "transcript_preview": [u.text[:50] for u in session.transcript[:5]],
        "is_transcribing": session_manager.is_transcribing(session_id) if hasattr(session_manager, 'is_transcribing') else "unknown"
    }

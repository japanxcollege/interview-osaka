"""
WebSocket処理
- 接続管理
- メッセージルーティング
- ブロードキャスト
"""

from fastapi import WebSocket, WebSocketDisconnect
from typing import Dict, Set
import json
import logging
from gemini_client import gemini_client

logger = logging.getLogger(__name__)


class ConnectionManager:
    """WebSocket接続管理"""

    def __init__(self):
        # session_id -> Set[WebSocket] のマッピング
        self.active_connections: Dict[str, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, session_id: str):
        """WebSocket接続を確立"""
        await websocket.accept()

        if session_id not in self.active_connections:
            self.active_connections[session_id] = set()

        self.active_connections[session_id].add(websocket)
        logger.info(f"✅ WebSocket connected: session={session_id}, total={len(self.active_connections[session_id])}")

    def disconnect(self, websocket: WebSocket, session_id: str):
        """WebSocket接続を切断"""
        if session_id in self.active_connections:
            self.active_connections[session_id].discard(websocket)

            # 接続がなくなったらキーを削除
            if not self.active_connections[session_id]:
                del self.active_connections[session_id]

            logger.info(f"❌ WebSocket disconnected: session={session_id}")

    async def send_personal_message(self, message: dict, websocket: WebSocket):
        """特定のクライアントにメッセージ送信"""
        await websocket.send_json(message)

    async def broadcast(self, session_id: str, message: dict, exclude: WebSocket = None):
        """セッション内の全クライアントにブロードキャスト"""
        if session_id not in self.active_connections:
            return

        # 送信失敗した接続を記録
        dead_connections = set()

        for connection in self.active_connections[session_id]:
            # exclude指定があればスキップ
            if connection == exclude:
                continue

            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Failed to send message: {e}")
                dead_connections.add(connection)

        # 送信失敗した接続を削除
        for connection in dead_connections:
            self.disconnect(connection, session_id)


# グローバルインスタンス
manager = ConnectionManager()


async def handle_websocket(
    websocket: WebSocket,
    session_id: str,
    session_manager,
    transcription_manager
):
    """WebSocket接続ハンドラー"""
    await manager.connect(websocket, session_id)

    try:
        # 初期データ送信
        session = session_manager.get_session(session_id)
        if not session:
            await websocket.send_json({
                'type': 'error',
                'message': f'Session {session_id} not found'
            })
            await websocket.close()
            return

        await websocket.send_json({
            'type': 'initial_data',
            'data': session.model_dump()
        })

        # メッセージループ
        while True:
            data = await websocket.receive_json()
            await process_message(
                session_id,
                data,
                websocket,
                session_manager,
                transcription_manager
            )

    except WebSocketDisconnect:
        manager.disconnect(websocket, session_id)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket, session_id)


async def process_message(
    session_id: str,
    message: dict,
    websocket: WebSocket,
    session_manager,
    transcription_manager
):
    """メッセージ処理とルーティング"""
    msg_type = message.get('type')

    try:
        if msg_type == 'edit_article':
            # 原稿編集
            text = message['data']['text']
            await session_manager.update_article(session_id, text)

            # 他のクライアントにブロードキャスト
            await manager.broadcast(session_id, {
                'type': 'article_updated',
                'data': {
                    'text': text,
                    'last_updated': session_manager.get_session(session_id).article_draft.last_updated
                }
            }, exclude=websocket)

        elif msg_type == 'add_note':
            # メモ追加
            text = message['data']['text']
            note = await session_manager.add_note(session_id, text)

            # 全クライアントにブロードキャスト（自分も含む）
            await manager.broadcast(session_id, {
                'type': 'note_added',
                'data': note.model_dump()
            })

        elif msg_type == 'delete_note':
            # メモ削除
            note_id = message['data']['note_id']
            await session_manager.delete_note(session_id, note_id)

            # 全クライアントにブロードキャスト
            await manager.broadcast(session_id, {
                'type': 'note_deleted',
                'data': {'note_id': note_id}
            })

        elif msg_type == 'edit_utterance':
            # 発話編集
            utterance_id = message['data']['utterance_id']
            text = message['data']['text']
            speaker_name = message['data']['speaker_name']

            utterance = await session_manager.edit_utterance(session_id, utterance_id, text, speaker_name)

            # 全クライアントにブロードキャスト
            await manager.broadcast(session_id, {
                'type': 'utterance_edited',
                'data': {
                    'utterance_id': utterance_id,
                    'text': text,
                    'speaker_name': speaker_name
                }
            })

        elif msg_type == 'delete_utterance':
            # 発話削除
            utterance_id = message['data']['utterance_id']
            await session_manager.delete_utterance(session_id, utterance_id)

            # 全クライアントにブロードキャスト
            await manager.broadcast(session_id, {
                'type': 'utterance_deleted',
                'data': {'utterance_id': utterance_id}
            })

        elif msg_type == 'audio_chunk':
            # Web Audio API からの音声チャンクを処理
            try:
                if not transcription_manager.enabled:
                    await websocket.send_json({
                        'type': 'error',
                        'message': 'Whisper APIが無効です。OPENAI_API_KEYを設定してください。'
                    })
                    return

                chunk_base64 = message['data'].get('chunk')
                mime_type = message['data'].get('mime_type', 'audio/webm')
                speaker_name = message['data'].get('speaker_name', 'Interviewer')
                speaker_id = message['data'].get('speaker_id', 'speaker_web')

                logger.info(
                    "Received audio_chunk: mime=%s, size=%s bytes",
                    mime_type,
                    len(chunk_base64) // 4 * 3 if chunk_base64 else 0
                )

                if not chunk_base64:
                    await websocket.send_json({
                        'type': 'error',
                        'message': '音声データが空です'
                    })
                    return

                await transcription_manager.enqueue_audio_chunk(
                    session_id=session_id,
                    base64_data=chunk_base64,
                    mime_type=mime_type,
                    speaker_id=speaker_id,
                    speaker_name=speaker_name
                )

                await websocket.send_json({
                    'type': 'whisper_status',
                    'data': {'status': 'queued'}
                })
            except Exception as e:
                logger.error(f"Error handling audio_chunk: {e}")
                await websocket.send_json({
                    'type': 'error',
                    'message': f'音声処理中にエラーが発生しました: {str(e)}'
                })

        elif msg_type == 'update_status':
            # ステータス更新
            status = message['data']['status']
            await session_manager.update_status(session_id, status)

            # 全クライアントにブロードキャスト
            await manager.broadcast(session_id, {
                'type': 'status_updated',
                'data': {'status': status}
            })

        elif msg_type == 'improve_text':
            # テキスト改善 / AIチャット
            try:
                selected_text = message['data'].get('selected_text', '')
                instruction = message['data'].get('instruction', '')
                context = message['data'].get('context', '')
                start_pos = message['data'].get('start_pos')
                end_pos = message['data'].get('end_pos')
                chat_history = message['data'].get('messages', [])

                # AI処理 (ai_editorを使用するように変更)
                from ai_editor import ai_editor
                
                logger.info(f"🚀 improve_text requested: instruction={instruction[:50]}..., selected_len={len(selected_text)}, context_len={len(context)}, history_len={len(chat_history)}")
                
                improved = await ai_editor.edit_text(
                    instruction=instruction,
                    selected_text=selected_text,
                    context=context,
                    model_provider="gemini", # Default to Gemini for WS for now, or get from msg
                    chat_history=chat_history
                )
                
                logger.info(f"✨ improve_text result: {improved[:50] if improved else 'None'}")

                if improved:
                    # 結果を送信
                    await websocket.send_json({
                        'type': 'text_improved',
                        'data': {
                            'improved_text': improved,
                            'start_pos': start_pos if start_pos is not None else 0,
                            'end_pos': end_pos if end_pos is not None else 0
                        }
                    })
                    logger.info(f"✅ AI response generated. Length: {len(improved)}")
                else:
                    error_msg = 'AI生成に失敗しました'
                    await websocket.send_json({
                        'type': 'error',
                        'message': error_msg
                    })
            except Exception as e:
                logger.error(f"Error in improve_text: {e}")
                await websocket.send_json({
                    'type': 'error',
                    'message': f'AI処理中にエラーが発生しました: {str(e)}'
                })

        elif msg_type == 'restructure_subsection':
            # 小見出しセクション再構成
            try:
                selected_text = message['data'].get('selected_text', '')
                start_pos = message['data'].get('start_pos')
                end_pos = message['data'].get('end_pos')

                if not selected_text or not selected_text.strip():
                    await websocket.send_json({
                        'type': 'error',
                        'message': '選択されたテキストが空です'
                    })
                    return

                if start_pos is None or end_pos is None:
                    await websocket.send_json({
                        'type': 'error',
                        'message': 'テキスト位置情報が不正です'
                    })
                    return

                session = session_manager.get_session(session_id)
                full_article = session.article_draft.text if session else ""

                # AI処理
                restructured = await gemini_client.restructure_as_subsection(
                    selected_text=selected_text,
                    full_article=full_article
                )

                if restructured:
                    # 結果を送信
                    await websocket.send_json({
                        'type': 'text_improved',
                        'data': {
                            'improved_text': restructured,
                            'start_pos': start_pos,
                            'end_pos': end_pos
                        }
                    })
                    logger.info(f"✅ Subsection restructured: {len(selected_text)} -> {len(restructured)} chars")
                else:
                    error_msg = 'セクションの再構成に失敗しました'
                    if not gemini_client.enabled:
                        error_msg += ' (Gemini APIが設定されていません)'
                    await websocket.send_json({
                        'type': 'error',
                        'message': error_msg
                    })
            except Exception as e:
                logger.error(f"Error in restructure_subsection: {e}")
                await websocket.send_json({
                    'type': 'error',
                    'message': f'セクション再構成処理中にエラーが発生しました: {str(e)}'
                })

        elif msg_type == 'trigger_article_generation':
            # 手動で原稿生成をトリガー
            try:
                from summary_task import get_summary_task
                summary_task_manager = get_summary_task(session_manager)
                
                # process_transcript_updateを呼び出して、原稿生成を強制実行
                await summary_task_manager.process_transcript_update(session_id)
                
                await websocket.send_json({
                    'type': 'info',
                    'message': '原稿生成をトリガーしました'
                })
                logger.info(f"✅ Manual article generation triggered for {session_id}")
            except Exception as e:
                logger.error(f"Error triggering article generation: {e}")
                await websocket.send_json({
                    'type': 'error',
                    'message': f'原稿生成のトリガーに失敗しました: {str(e)}'
                })

        elif msg_type == 'trigger_question_generation':
            # 手動で質問提案をトリガー
            try:
                from summary_task import get_summary_task
                summary_task_manager = get_summary_task(session_manager)
                
                # process_transcript_updateを呼び出して、質問提案を強制実行
                await summary_task_manager.process_transcript_update(session_id)
                
                await websocket.send_json({
                    'type': 'info',
                    'message': '質問提案をトリガーしました'
                })
                logger.info(f"✅ Manual question generation triggered for {session_id}")
            except Exception as e:
                logger.error(f"Error triggering question generation: {e}")
                await websocket.send_json({
                    'type': 'error',
                    'message': f'質問提案のトリガーに失敗しました: {str(e)}'
                })

        elif msg_type == 'interviewer_generate_response':
            # AIインタビュアーのレスポンス生成
            try:
                from ai_editor import ai_editor
                
                session = session_manager.get_session(session_id)
                if not session:
                    raise ValueError(f"Session {session_id} not found")

                context = message['data'].get('context', '') or session.context # Prefer msg, fallback to session
                model_provider = message['data'].get('model_provider', 'gemini')
                ai_mode = message['data'].get('ai_mode', 'empath')
                chat_history = message['data'].get('messages', [])
                
                transcript_text = "\n".join([f"{u.speaker_name}: {u.text}" for u in session.transcript[-10:]]) # 直近10発話
                
                logger.info(f"📝 Interviewer request: ai_mode={ai_mode}, provider={model_provider}, transcript_len={len(transcript_text)}, chat_history_len={len(chat_history)}")
                
                response_text = await ai_editor.generate_interviewer_response(
                    transcript_text=transcript_text,
                    context=context,
                    chat_history=chat_history,
                    model_provider=model_provider,
                    ai_mode=ai_mode
                )
                
                logger.info(f"📝 Interviewer response: {response_text[:100] if response_text else 'None'}")
                
                if response_text:
                    # Save AI response as utterance
                    from models import Utterance # Ensure imported or use session_manager internal
                    # Actually session_manager.add_transcription_text creates Utterance, 
                    # but we want to specify exact text and speaker.
                    # Use add_transcription_text is simpler but it checks duplicates.
                    # Or construct Utterance manually and use add_utterance.
                    
                    # Let's use add_transcription_text which handles broadcast usually? 
                    # No, add_transcription_text doesn't broadcast in session_manager.
                    # But process_message usually handles broadcast?
                    
                    # Let's use simple add_transcription_text logic here but manually:
                    ai_utterance = await session_manager.add_transcription_text(
                        session_id=session_id,
                        text=response_text,
                        speaker_id="ai_interviewer",
                        speaker_name="AI Interviewer"
                    )

                    if ai_utterance:
                        # Broadcast utterance_added (standard flow)
                        await manager.broadcast(session_id, {
                            'type': 'utterance_added',
                            'data': ai_utterance.model_dump()
                        })

                        # Also send interviewer_response for TTS trigger if needed (frontend uses it)
                        await websocket.send_json({
                            'type': 'interviewer_response',
                            'data': {
                                'text': response_text
                            }
                        })
                        logger.info(f"✅ Interviewer response saved & sent: {response_text[:50]}...")
                    else:
                         logger.warning("Duplicate or empty AI response, not saved.")
                else:
                    await websocket.send_json({
                        'type': 'error',
                        'message': 'インタビュアーのレスポンス生成に失敗しました'
                    })
            except Exception as e:
                logger.error(f"Error in interviewer_generate_response: {e}")
                await websocket.send_json({
                    'type': 'error',
                    'message': f'AIインタビュアー処理中にエラーが発生しました: {str(e)}'
                })

        elif msg_type == 'user_utterance':
            # ユーザー発話（Web Speech APIなどからの直接テキスト入力）
            try:
                text = message['data'].get('text', '')
                speaker_name = message['data'].get('speaker_name', 'User')
                
                if not text:
                    return

                utterance = await session_manager.add_transcription_text(
                    session_id=session_id,
                    text=text,
                    speaker_id="speaker_user", # Fixed ID for user for now
                    speaker_name=speaker_name
                )
                
                if utterance:
                    # 全クライアントにブロードキャスト
                    await manager.broadcast(session_id, {
                        'type': 'utterance_added',
                        'data': utterance.model_dump()
                    })
                    logger.info(f"✅ User utterance added: {text[:50]}...")
            except Exception as e:
                logger.error(f"Error processing user_utterance: {e}")
                await websocket.send_json({
                    'type': 'error',
                    'message': f'発話の保存中にエラーが発生しました: {str(e)}'
                })

        elif msg_type == 'restructure_section':
            # 大見出しセクション再構成
            try:
                selected_text = message['data'].get('selected_text', '')
                start_pos = message['data'].get('start_pos')
                end_pos = message['data'].get('end_pos')

                if not selected_text or not selected_text.strip():
                    await websocket.send_json({
                        'type': 'error',
                        'message': '選択されたテキストが空です'
                    })
                    return

                if start_pos is None or end_pos is None:
                    await websocket.send_json({
                        'type': 'error',
                        'message': 'テキスト位置情報が不正です'
                    })
                    return

                session = session_manager.get_session(session_id)
                full_article = session.article_draft.text if session else ""

                # AI処理
                restructured = await gemini_client.restructure_as_section(
                    selected_text=selected_text,
                    full_article=full_article
                )

                if restructured:
                    # 結果を送信
                    await websocket.send_json({
                        'type': 'text_improved',
                        'data': {
                            'improved_text': restructured,
                            'start_pos': start_pos,
                            'end_pos': end_pos
                        }
                    })
                    logger.info(f"✅ Section restructured: {len(selected_text)} -> {len(restructured)} chars")
                else:
                    error_msg = 'セクションの再構成に失敗しました'
                    if not gemini_client.enabled:
                        error_msg += ' (Gemini APIが設定されていません)'
                    await websocket.send_json({
                        'type': 'error',
                        'message': error_msg
                    })
            except Exception as e:
                logger.error(f"Error in restructure_section: {e}")
                await websocket.send_json({
                    'type': 'error',
                    'message': f'セクション再構成処理中にエラーが発生しました: {str(e)}'
                })

        else:
            logger.warning(f"Unknown message type: {msg_type}")
            await websocket.send_json({
                'type': 'error',
                'message': f'Unknown message type: {msg_type}'
            })

    except Exception as e:
        logger.error(f"Error processing message: {e}")
        await websocket.send_json({
            'type': 'error',
            'message': str(e)
        })

/**
 * エディタページ
 * 3パネルレイアウト（原稿・文字起こし・メモ）
 */

'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { InterviewSession, WebSocketMessage } from '@/types';
import { WebSocketClient } from '@/lib/websocket';
import ArticlePanel from '@/components/ArticlePanel';
import TranscriptPanel from '@/components/TranscriptPanel';
import NotesPanel from '@/components/NotesPanel';
import AISuggestionsPanel from '@/components/AISuggestionsPanel';
import AudioRecorder from '@/components/AudioRecorder';

export default function EditorPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;

  const [session, setSession] = useState<InterviewSession | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isAIProcessing, setIsAIProcessing] = useState(false);
  const [recorderError, setRecorderError] = useState<string | null>(null);
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);
  const [availableStyles, setAvailableStyles] = useState<any[]>([]);
  const wsClient = useRef<WebSocketClient | null>(null);
  const hasStoppedRef = useRef(false);

  useEffect(() => {
    // Fetch Styles
    const fetchStyles = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8005';
        const res = await fetch(`${apiUrl}/api/styles`);
        if (res.ok) {
          setAvailableStyles(await res.json());
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchStyles();
  }, []);

  useEffect(() => {
    // 既に接続済みの場合はスキップ（重複接続防止）
    if (wsClient.current) {
      return;
    }

    // まずAPIからセッションを取得（即座に）
    const fetchSessionFromAPI = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8005';
        const response = await fetch(`${apiUrl}/api/sessions/${sessionId}`);
        if (response.ok) {
          const sessionData = await response.json();
          setSession(sessionData);
          setIsRecording(sessionData.status === 'recording');
          console.log('✅ Session loaded from API');
          return true;
        } else {
          console.error('Failed to fetch session:', response.status, response.statusText);
          alert(`セッションが見つかりません: ${sessionId}`);
          return false;
        }
      } catch (error) {
        console.error('Failed to fetch session from API:', error);
        alert(`セッションの取得に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
        return false;
      }
    };

    // WebSocket接続
    const handleMessage = (message: WebSocketMessage) => {
      switch (message.type) {
        case 'initial_data':
          setSession(message.data);
          setIsRecording(message.data.status === 'recording');
          setIsConnected(true);
          break;

        case 'utterance_added':
          setSession((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              transcript: [...prev.transcript, message.data],
            };
          });
          break;

        case 'article_updated':
          setSession((prev) => {
            if (!prev) return null;
            // Update active draft
            const updatedDraft = {
              ...prev.article_draft,
              text: message.data.text,
              last_updated: message.data.last_updated,
            };
            // Update in drafts list
            const updatedDrafts = (prev.drafts || []).map(d =>
              d.draft_id === prev.article_draft.draft_id
                ? { ...d, text: message.data.text, last_updated: message.data.last_updated }
                : d
            );

            return {
              ...prev,
              article_draft: updatedDraft,
              drafts: updatedDrafts
            };
          });
          break;

        case 'note_added':
          setSession((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              notes: [...prev.notes, message.data],
            };
          });
          break;

        case 'note_deleted':
          setSession((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              notes: prev.notes.filter((n) => n.note_id !== message.data.note_id),
            };
          });
          break;

        case 'utterance_edited':
          setSession((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              transcript: prev.transcript.map((u) =>
                u.utterance_id === message.data.utterance_id
                  ? { ...u, text: message.data.text, speaker_name: message.data.speaker_name }
                  : u
              ),
            };
          });
          break;

        case 'utterance_deleted':
          setSession((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              transcript: prev.transcript.filter((u) => u.utterance_id !== message.data.utterance_id),
            };
          });
          break;

        case 'status_updated':
          setSession((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              status: message.data.status,
            };
          });
          setIsRecording(message.data.status === 'recording');
          if (message.data.status === 'recording') {
            hasStoppedRef.current = false;
          } else if (message.data.status === 'editing') {
            hasStoppedRef.current = true;
          }
          break;

        case 'question_suggested':
          setSession((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              suggested_questions: [
                ...(prev.suggested_questions || []),
                message.data.question,
              ],
            };
          });
          break;

        case 'summary_updated':
          setSession((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              front_summary: message.data.front_summary ?? prev.front_summary,
              auto_summary: message.data.auto_summary ?? prev.auto_summary,
            };
          });
          break;

        case 'text_improved':
          // AI処理の結果を受信して記事を更新
          setIsAIProcessing(false);
          setSession((prev) => {
            if (!prev) return null;

            const { improved_text, start_pos, end_pos } = message.data;
            const currentText = prev.article_draft.text;

            // 位置の検証
            if (start_pos < 0 || end_pos > currentText.length || start_pos > end_pos) {
              console.error('❌ Invalid position range:', { start_pos, end_pos, textLength: currentText.length });
              alert('エラー: テキスト位置が無効です。ページをリロードしてください。');
              return prev;
            }

            // 選択範囲を改善されたテキストで置換
            const before = currentText.substring(0, start_pos);
            const after = currentText.substring(end_pos);
            const newText = before + improved_text + after;

            console.log('✅ Text improved successfully:', {
              originalLength: end_pos - start_pos,
              improvedLength: improved_text.length,
              newTextLength: newText.length
            });


            const updatedDraft = {
              ...prev.article_draft,
              text: newText,
              last_updated: new Date().toISOString(),
            };

            // Sync with drafts list
            const updatedDrafts = (prev.drafts || []).map(d =>
              d.draft_id === prev.article_draft.draft_id
                ? { ...d, text: newText, last_updated: updatedDraft.last_updated }
                : d
            );

            // Persist change
            if (wsClient.current) {
              wsClient.current.send('edit_article', { text: newText });
            }

            return {
              ...prev,
              article_draft: updatedDraft,
              drafts: updatedDrafts
            };
          });
          break;

        case 'ai_counters_updated':
          // AIカウンター更新
          setSession((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              pending_ai_article_count: message.data.pending_article_count ?? prev.pending_ai_article_count,
              pending_ai_question_count: message.data.pending_question_count ?? prev.pending_ai_question_count,
            };
          });
          break;

        case 'info':
          console.log('ℹ️ Info:', message.message);
          break;

        case 'error':
          console.error('WebSocket error:', message.message);
          // AI処理中のエラーはローディング状態を解除
          if (isAIProcessing) {
            setIsAIProcessing(false);
          }
          // セッションが見つからない場合は、既にAPIから取得済みなので無視
          if (message.message.includes('not found')) {
            console.log('⚠️ Session not found via WebSocket, but already loaded from API');
          } else {
            alert(`エラー: ${message.message}`);
          }
          break;
      }
    };

    // まずAPIからセッションを取得してから、WebSocket接続を試みる
    fetchSessionFromAPI().then((success) => {
      if (success) {
        // セッションが取得できたら、WebSocket接続を試みる
        wsClient.current = new WebSocketClient(sessionId, handleMessage);
        wsClient.current.connect();
      }
    });

    return () => {
      wsClient.current?.disconnect();
      wsClient.current = null;
    };
  }, [sessionId]);

  const handleArticleChange = (text: string) => {
    wsClient.current?.send('edit_article', { text });
  };

  const handleAddNote = (text: string) => {
    wsClient.current?.send('add_note', { text });
  };

  const handleDeleteNote = (noteId: string) => {
    wsClient.current?.send('delete_note', { note_id: noteId });
  };

  const handleEditUtterance = (utteranceId: string, newText: string, newSpeakerName: string) => {
    wsClient.current?.send('edit_utterance', {
      utterance_id: utteranceId,
      text: newText,
      speaker_name: newSpeakerName
    });
  };

  const handleDeleteUtterance = (utteranceId: string) => {
    wsClient.current?.send('delete_utterance', { utterance_id: utteranceId });
  };

  const toggleRecording = async () => {
    if (!isRecording && hasStoppedRef.current) {
      window.location.reload();
      return;
    }

    const endpoint = isRecording ? 'stop-recording' : 'start-recording';
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8005';
      const response = await fetch(`${apiUrl}/api/sessions/${sessionId}/${endpoint}`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to toggle recording');
      }

      const data = await response.json();
      setIsRecording(data.status === 'recording');
      if (data.status === 'recording') {
        setRecorderError(null);
        hasStoppedRef.current = false;
      } else if (data.status === 'editing') {
        hasStoppedRef.current = true;
      }
    } catch (error) {
      console.error('Failed to toggle recording:', error);
      alert('録音の切り替えに失敗しました');
    }
  };

  const handleGenerateDraft = async (styleId: string) => {
    try {
      setIsAIProcessing(true);
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8005';
      const res = await fetch(`${apiUrl}/api/sessions/${sessionId}/drafts/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ style_id: styleId })
      });
      if (!res.ok) throw new Error('Failed to generate');
      // WebSocket will update session with initial_data
    } catch (e) {
      console.error(e);
      alert('生成に失敗しました');
      setIsAIProcessing(false);
    }
  };

  const handleSwitchDraft = async (draftId: string) => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8005';
      const res = await fetch(`${apiUrl}/api/sessions/${sessionId}/drafts/switch`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft_id: draftId })
      });
      if (!res.ok) throw new Error('Failed to switch');
    } catch (e) {
      console.error(e);
      alert('切り替えに失敗しました');
    }
  };

  if (!session) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      <header className="bg-white border-b border-gray-300 px-6 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold truncate">{session.title}</h1>
            {!isHeaderCollapsed && (
              <p className="text-sm text-gray-500 mt-1">
                作成日時: {new Date(session.created_at).toLocaleString('ja-JP')}
                {' | '}
                ステータス: <span className="font-medium">{session.status}</span>
                {' | '}
                接続状態: {isConnected ? '🟢 接続中' : '🔴 切断'}
              </p>
            )}
          </div>
          <button
            onClick={() => setIsHeaderCollapsed((prev) => !prev)}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition flex-shrink-0"
            aria-expanded={!isHeaderCollapsed}
            aria-label={isHeaderCollapsed ? 'ヘッダー詳細を表示' : 'ヘッダーを収納'}
          >
            {isHeaderCollapsed ? '▼ 詳細を表示' : '▲ ヘッダーを収納'}
          </button>
        </div>
        {/* AudioRecorderは常にマウントしたまま（録音を継続するため） */}
        <div className={isHeaderCollapsed ? 'hidden' : ''}>
          <AudioRecorder
            sessionId={sessionId}
            wsClient={wsClient.current}
            isRecording={isRecording}
            speakerId="speaker_web"
            speakerName="Interviewer"
            onError={(message) => setRecorderError(message)}
          />
        </div>
        {!isHeaderCollapsed && (
          <div className="mt-4 flex flex-col items-end gap-3">
            {recorderError && (
              <p className="text-xs text-red-600 max-w-xs text-right">
                {recorderError}
              </p>
            )}
            <div className="flex gap-3">
              <button
                onClick={toggleRecording}
                className={`px-6 py-2 rounded font-medium transition ${isRecording
                  ? 'bg-red-500 text-white hover:bg-red-600'
                  : 'bg-green-500 text-white hover:bg-green-600'
                  }`}
              >
                {isRecording ? '⏸️ 録音停止' : '▶️ 録音開始'}
              </button>
              <button
                onClick={() => router.push('/')}
                className="px-6 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition font-medium"
              >
                ← 戻る
              </button>
            </div>
          </div>
        )}
      </header>

      {/* 4パネルレイアウト (Phase 1) */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左: 原稿 (30%) */}
        <div className="w-[30%] relative">
          <ArticlePanel
            text={session.article_draft.text}
            lastUpdated={session.article_draft.last_updated}
            onChange={handleArticleChange}
            wsClient={wsClient.current}
            onAIProcessingStart={() => setIsAIProcessing(true)}
            onAIProcessingEnd={() => setIsAIProcessing(false)}
            drafts={session.drafts || []}
            activeDraftId={session.article_draft?.draft_id}
            onSwitchDraft={handleSwitchDraft}
            onGenerateDraft={handleGenerateDraft}
            availableStyles={availableStyles}
          />
          {/* AI処理中のオーバーレイ */}
          {isAIProcessing && (
            <div className="absolute inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50 pointer-events-none">
              <div className="bg-white rounded-lg p-6 shadow-xl flex items-center gap-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                <span className="text-lg font-medium">🤖 AI処理中...</span>
              </div>
            </div>
          )}
        </div>

        {/* 中央左: 文字起こし (30%) */}
        <div className="w-[30%]">
          <TranscriptPanel
            transcript={session.transcript}
            onEdit={handleEditUtterance}
            onDelete={handleDeleteUtterance}
            sessionId={sessionId}
          />
        </div>

        {/* 中央右: メモ (20%) */}
        <div className="w-[20%]">
          <NotesPanel
            notes={session.notes}
            onAdd={handleAddNote}
            onDelete={handleDeleteNote}
          />
        </div>

        {/* 右: AI提案 (20%) - Phase 1 */}
        <div className="w-[20%]">
          <AISuggestionsPanel
            suggestedQuestions={session.suggested_questions || []}
            frontSummary={session.front_summary}
            autoSummary={session.auto_summary}
            pendingArticleCount={session.pending_ai_article_count || 0}
            pendingQuestionCount={session.pending_ai_question_count || 0}
          />
        </div>
      </div>
    </div>
  );
}

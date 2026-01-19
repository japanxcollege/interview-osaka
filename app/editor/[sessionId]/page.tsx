
/**
 * エディタページ
 * 3パネルレイアウト（原稿・文字起こし・右パネル[Chat/提案]）
 */

'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { InterviewSession, WebSocketMessage } from '@/types';
import { WebSocketClient, ConnectionState } from '@/lib/websocket';
import ArticlePanel from '@/components/ArticlePanel';
import TranscriptPanel from '@/components/TranscriptPanel';
import NotesPanel from '@/components/NotesPanel';
import AssistantPanel from '@/components/AssistantPanel'; // New combined panel
import AudioRecorder from '@/components/AudioRecorder';
import { useEditorHistory } from '@/hooks/useEditorHistory'; // New hook
import { Message } from '@/components/AICommandPanel'; // Type definition
import Toast from '@/components/Toast';
import { useToast } from '@/hooks/useToast';
import { AIStatus } from '@/components/AISuggestionsPanel';

export default function EditorPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;

  const [session, setSession] = useState<InterviewSession | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('CONNECTING'); // New detailed state
  const [isConnected, setIsConnected] = useState(false); // Legacy simplified state (keep for now or derive)
  const [isRecording, setIsRecording] = useState(false);
  const [isAIProcessing, setIsAIProcessing] = useState(false);
  const [recorderError, setRecorderError] = useState<string | null>(null);
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);
  const [availableStyles, setAvailableStyles] = useState<any[]>([]);

  // AI Status State
  const [aiStatus, setAiStatus] = useState<{
    article: AIStatus;
    question: AIStatus;
    general?: AIStatus;
  }>({
    article: { target: 'article', status: 'idle', message: '' },
    question: { target: 'question', status: 'idle', message: '' },
    general: { target: 'general', status: 'idle', message: '' }
  });

  // Toast Notifications
  const { toasts, addToast, removeToast } = useToast();
  const connectionToastIdRef = useRef<string | null>(null);

  // Chat State
  const [chatMessages, setChatMessages] = useState<Message[]>([]);

  // Pending content to insert into Editor (from Chat Apply)
  const [pendingAIContent, setPendingAIContent] = useState<string | null>(null);

  const wsClient = useRef<WebSocketClient | null>(null);
  const hasStoppedRef = useRef(false);

  // History Management
  // Initial state is empty string until session loads
  const {
    content,
    setContent,
    undo,
    redo,
    canUndo,
    canRedo,
    saveSnapshot
  } = useEditorHistory('');

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

  const handleConnectionStateChange = (state: ConnectionState) => {
    setConnectionState(state);
    setIsConnected(state === 'OPEN');

    // Manage Toasts based on state
    if (state === 'RECONNECTING') {
      if (!connectionToastIdRef.current) {
        const id = crypto.randomUUID();
        connectionToastIdRef.current = id;
        addToast(
          '⚠️ サーバーとの接続が切れました。再接続しています...',
          'warning',
          Infinity
        );
      }
    } else if (state === 'OFFLINE') {
      if (connectionToastIdRef.current) removeToast(connectionToastIdRef.current);
      const id = crypto.randomUUID();
      connectionToastIdRef.current = id;
      addToast(
        '❌ サーバーに接続できません。ページをリロードするか、再接続ボタンを押してください。',
        'error',
        Infinity
      );
    } else if (state === 'OPEN') {
      if (connectionToastIdRef.current) {
        removeToast(connectionToastIdRef.current);
        connectionToastIdRef.current = null;
        addToast('✅ 再接続しました', 'success', 3000);
      }
    }
  };

  useEffect(() => {
    if (wsClient.current) return;

    const fetchSessionFromAPI = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8005';
        const response = await fetch(`${apiUrl}/api/sessions/${sessionId}`);
        if (response.ok) {
          const sessionData = await response.json();
          setSession(sessionData);
          setIsRecording(sessionData.status === 'recording');

          // Initialize history content if currently empty
          // We assume if history content is empty, it's the first load
          if (content === '' && sessionData.article_draft?.text) {
            setContent(sessionData.article_draft.text);
          }

          return true;
        } else {
          alert(`セッションが見つかりません: ${sessionId}`);
          return false;
        }
      } catch (error) {
        alert(`セッションの取得に失敗しました`);
        return false;
      }
    };

    const handleMessage = (message: any) => {
      const wsMessage = message as WebSocketMessage | { type: 'ai_status_update'; data: AIStatus };

      switch (wsMessage.type) {
        case 'initial_data':
          setSession(wsMessage.data);
          setIsRecording(wsMessage.data.status === 'recording');
          // setIsConnected(true); // Handled by state change callback
          // Sync history if needed
          if (content === '' && wsMessage.data.article_draft?.text) {
            setContent(wsMessage.data.article_draft.text);
          }
          break;

        case 'utterance_added':
          setSession((prev) => prev ? ({ ...prev, transcript: [...prev.transcript, wsMessage.data] }) : null);
          break;
        case 'utterance_edited':
          setSession((prev) => prev ? ({ ...prev, transcript: prev.transcript.map(u => u.utterance_id === wsMessage.data.utterance_id ? { ...u, ...wsMessage.data } : u) }) : null);
          break;
        case 'utterance_deleted':
          setSession((prev) => prev ? ({ ...prev, transcript: prev.transcript.filter(u => u.utterance_id !== wsMessage.data.utterance_id) }) : null);
          break;

        case 'note_added':
          setSession((prev) => prev ? ({ ...prev, notes: [...prev.notes, wsMessage.data] }) : null);
          break;
        case 'note_deleted':
          setSession((prev) => prev ? ({ ...prev, notes: prev.notes.filter(n => n.note_id !== wsMessage.data.note_id) }) : null);
          break;

        case 'article_updated':
          setSession((prev) => prev ? ({ ...prev, article_draft: { ...prev.article_draft, text: wsMessage.data.text } }) : null);
          // Show notification for auto-generated sections (if we are in recording/editing)
          if (wsMessage.data.text.length > (session?.article_draft?.text?.length || 0)) {
            addToast('AIによって新しい原稿セクションが追加されました', 'success');
          }
          break;

        case 'text_improved':
          // Received AI improved text.
          // STOP auto-applying.
          // Add to Chat Messages.
          setIsAIProcessing(false);

          const newAiMessage: Message = {
            id: crypto.randomUUID(),
            role: 'ai',
            content: wsMessage.data.improved_text,
            timestamp: new Date()
          };
          setChatMessages(prev => [...prev, newAiMessage]);
          addToast('AIによる改善が完了しました', 'success');
          break;

        case 'status_updated':
          setSession((prev) => {
            if (!prev) return null;
            if (wsMessage.data.status === 'recording') hasStoppedRef.current = false;
            if (wsMessage.data.status === 'editing') hasStoppedRef.current = true;
            return { ...prev, status: wsMessage.data.status };
          });
          setIsRecording(wsMessage.data.status === 'recording');
          break;

        case 'question_suggested':
          setSession(prev => prev ? ({ ...prev, suggested_questions: [...(prev.suggested_questions || []), wsMessage.data.question] }) : null);
          addToast('AIが新しい質問を提案しました', 'info');
          break;

        case 'summary_updated':
          setSession(prev => prev ? ({ ...prev, front_summary: wsMessage.data.front_summary, auto_summary: wsMessage.data.auto_summary }) : null);
          addToast('AIによる要約が更新されました', 'info');
          break;

        case 'ai_counters_updated':
          setSession(prev => prev ? ({ ...prev, pending_ai_article_count: wsMessage.data.pending_article_count, pending_ai_question_count: wsMessage.data.pending_question_count }) : null);
          break;

        case 'ai_status_update':
          const statusUpdate = wsMessage.data as AIStatus;
          setAiStatus(prev => ({
            ...prev,
            [statusUpdate.target]: statusUpdate
          }));
          break;

        case 'error':
          console.error('WS Error:', wsMessage.message);
          setIsAIProcessing(false);
          addToast(`エラー: ${wsMessage.message}`, 'error', 5000);
          break;
      }
    };

    fetchSessionFromAPI().then((success) => {
      if (success) {
        wsClient.current = new WebSocketClient(sessionId, handleMessage, handleConnectionStateChange);
        wsClient.current.connect();
      }
    });

    return () => {
      wsClient.current?.disconnect();
      wsClient.current = null;
    };
  }, [sessionId, addToast]); // added addToast to dependencies

  // Handlers
  const handleArticleChange = (newText: string) => {
    // Called when user types in ArticlePanel
    setContent(newText);
    // Sync to backend
    wsClient.current?.send('edit_article', { text: newText });
  };

  const handleApplyAI = async (text: string) => {
    // Auto-save current state as a version before applying AI changes
    await handleSaveDraft();

    // User clicked "Apply" in Chat
    setPendingAIContent(text);
    addToast('原稿にAI生成内容を挿入しました', 'success');
  };

  const handleRunAICommand = async (instruction: string, model: 'gemini' | 'claude') => {
    if (!wsClient.current) return null;
    setIsAIProcessing(true);
    addToast('AI処理リクエストを送信しました...', 'info', 2000);
    // Send as 'improve_text' but with no selection, implying general instruction
    wsClient.current.send('improve_text', {
      instruction,
      selected_text: '',
      start_pos: 0,
      end_pos: 0,
      messages: chatMessages // Include Chat History
    });
    return null; // Async response
  };

  // Other handlers
  const handleAddNote = (text: string) => wsClient.current?.send('add_note', { text });
  const handleDeleteNote = (id: string) => wsClient.current?.send('delete_note', { note_id: id });
  const handleEditUtterance = (id: string, text: string, name: string) => wsClient.current?.send('edit_utterance', { utterance_id: id, text, speaker_name: name });
  const handleDeleteUtterance = (id: string) => wsClient.current?.send('delete_utterance', { utterance_id: id });

  const toggleRecording = async () => {
    const endpoint = isRecording ? 'stop-recording' : 'start-recording';
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8005';
      await fetch(`${apiUrl}/api/sessions/${sessionId}/${endpoint}`, { method: 'POST' });
    } catch (e) {
      console.error(e);
      addToast('録音ステータスの変更に失敗しました', 'error');
    }
  };

  const handleManualReconnect = () => {
    if (wsClient.current) {
      wsClient.current.disconnect();
      wsClient.current.connect();
    }
  };

  if (!session) return <div className="p-10">Loading...</div>;

  const handleSaveDraft = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8005';
      const res = await fetch(`${apiUrl}/api/sessions/${sessionId}/drafts/snapshot`, {
        method: 'POST'
      });
      if (res.ok) {
        addToast('新しいバージョン（タブ）として保存しました', 'success');
        // Session update via WS broadcast will handle UI update
      } else {
        throw new Error('Failed to create snapshot');
      }
    } catch (e) {
      console.error(e);
      addToast('バージョンの保存に失敗しました', 'error');
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
      if (res.ok) {
        const updatedSession = await res.json();
        setSession(updatedSession);
        setContent(updatedSession.article_draft?.text || '');
        addToast('ドラフトを切り替えました', 'info');
      }
    } catch (e) {
      console.error(e);
      addToast('ドラフトの切り替えに失敗しました', 'error');
    }
  };

  // Responsive Tab State
  const [activeTab, setActiveTab] = useState<'article' | 'transcript' | 'assistant'>('transcript');

  // Speech Recognition Mode
  const [recognitionMode, setRecognitionMode] = useState<'cloud' | 'native'>('cloud');

  const handleNativeResult = (text: string) => {
    // Send native result as user utterance
    wsClient.current?.send('user_utterance', { text });
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-white">
      {/* Toast Notifications */}
      <Toast toasts={toasts} removeToast={removeToast} />

      {/* Header */}
      <header className="bg-white border-b border-gray-300 px-4 py-3 sm:px-6 sm:py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center shrink-0 gap-3 sm:gap-0">
        <div className="flex justify-between w-full sm:w-auto items-center">
          <div>
            <h1 className="text-lg sm:text-xl font-bold truncate max-w-[200px] sm:max-w-md">{session?.title || 'Loading...'}</h1>
            <div className="flex items-center gap-2">
              <p className="text-xs sm:text-sm text-gray-500">
                {connectionState === 'OPEN' ? '🟢 接続中' :
                  connectionState === 'CONNECTING' ? '🟡 接続中...' :
                    connectionState === 'RECONNECTING' ? '🟠 再接続中...' :
                      '🔴 切断'}
                | {session?.status}
              </p>
              {connectionState !== 'OPEN' && connectionState !== 'CONNECTING' && (
                <button
                  onClick={handleManualReconnect}
                  className="text-xs bg-gray-100 hover:bg-gray-200 border border-gray-300 px-2 py-0.5 rounded transition"
                  title="手動で再接続を試みます"
                >
                  🔄 再接続
                </button>
              )}
            </div>
          </div>
          {/* Mobile Back Button (visible only on mobile if you want, but sticking to desktop pattern for now) */}
          <button onClick={() => router.push('/')} className="sm:hidden p-2 bg-gray-100 rounded hover:bg-gray-200 transition text-sm">Esc</button>
        </div>

        <div className="flex gap-2 sm:gap-3 w-full sm:w-auto justify-end items-center">
          {/* Recognition Mode Toggle */}
          <div className="flex bg-gray-100 rounded-lg p-1 border border-gray-200">
            <button
              onClick={() => setRecognitionMode('cloud')}
              className={`px-3 py-1 text-xs rounded-md transition ${recognitionMode === 'cloud' ? 'bg-white shadow text-blue-600 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Cloud
            </button>
            <button
              onClick={() => setRecognitionMode('native')}
              className={`px-3 py-1 text-xs rounded-md transition ${recognitionMode === 'native' ? 'bg-white shadow text-green-600 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Native
            </button>
          </div>

          <AudioRecorder
            sessionId={sessionId}
            wsClient={wsClient.current}
            isRecording={isRecording}
            speakerId="speaker_web"
            speakerName="Interviewer"
            recognitionMode={recognitionMode}
            onNativeResult={handleNativeResult}
            onError={(err) => {
              setRecorderError(err);
              if (err) addToast(err, 'error', 5000);
            }}
          />
          <button
            onClick={toggleRecording}
            className={`px-3 py-2 sm:px-4 text-xs sm:text-sm rounded text-white transition shadow hover:shadow-md ${isRecording ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'}`}
          >
            {isRecording ? 'Stop' : 'Rec'}
          </button>
          <button onClick={() => router.push('/')} className="hidden sm:block px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 transition text-sm">Back</button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        {/* Left: Article (Mobile: Tab | Desktop: 35%) */}
        <div className={`${activeTab === 'article' ? 'flex' : 'hidden'} lg:flex w-full lg:w-[35%] h-full border-r border-gray-300 flex-col overflow-hidden`}>
          <ArticlePanel
            text={content} // History Content
            lastUpdated={session.article_draft.last_updated}
            onChange={handleArticleChange}
            wsClient={wsClient.current}
            onUndo={undo}
            onRedo={redo}
            canUndo={canUndo}
            canRedo={canRedo}
            onSaveVersion={handleSaveDraft}
            externalAction={pendingAIContent ? { type: 'insert', text: pendingAIContent } : null}
            onActionComplete={() => setPendingAIContent(null)}
            // Pass styles etc
            availableStyles={availableStyles}
            drafts={session.drafts || []}
            activeDraftId={session.article_draft?.draft_id}
            onSwitchDraft={handleSwitchDraft}
          />
        </div>

        {/* Center: Transcript (Mobile: Tab | Desktop: 30%) */}
        <div className={`${activeTab === 'transcript' ? 'flex' : 'hidden'} lg:flex w-full lg:w-[30%] h-full border-r border-gray-300 flex-col overflow-hidden`}>
          <TranscriptPanel
            transcript={session.transcript}
            onEdit={handleEditUtterance}
            onDelete={handleDeleteUtterance}
            sessionId={sessionId}
          />
        </div>

        {/* Right: Assistant (Mobile: Tab | Desktop: 35%) */}
        <div className={`${activeTab === 'assistant' ? 'flex' : 'hidden'} lg:flex w-full lg:w-[35%] h-full flex-col overflow-hidden`}>
          <div className="flex h-full w-full overflow-hidden flex-col sm:flex-row">
            {/* On Mobile, stack Notes (top 1/3) and Assistant (bottom 2/3) */}
            <div className="w-full sm:w-1/2 h-1/3 sm:h-full border-b sm:border-b-0 sm:border-r border-gray-300">
              <NotesPanel
                notes={session.notes}
                onAdd={handleAddNote}
                onDelete={handleDeleteNote}
              />
            </div>
            <div className="w-full sm:w-1/2 h-2/3 sm:h-full">
              <AssistantPanel
                onRunCommand={handleRunAICommand}
                onApply={handleApplyAI}
                isProcessing={isAIProcessing}
                messages={chatMessages}
                setMessages={setChatMessages}

                suggestedQuestions={session.suggested_questions || []}
                frontSummary={session.front_summary}
                autoSummary={session.auto_summary}
                pendingArticleCount={session.pending_ai_article_count}
                pendingQuestionCount={session.pending_ai_question_count}
                aiStatus={aiStatus}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Bottom Navigation */}
      <div className="lg:hidden shrink-0 h-16 bg-white border-t border-gray-200 flex justify-around items-center px-2 shadow-[0_-1px_3px_rgba(0,0,0,0.1)] z-20">
        <button
          onClick={() => setActiveTab('transcript')}
          className={`flex flex-col items-center justify-center w-full h-full ${activeTab === 'transcript' ? 'text-blue-600' : 'text-gray-400'}`}
        >
          <span className="text-2xl">💬</span>
          <span className="text-[10px] font-medium">Transcript</span>
        </button>
        <button
          onClick={() => setActiveTab('article')}
          className={`flex flex-col items-center justify-center w-full h-full ${activeTab === 'article' ? 'text-blue-600' : 'text-gray-400'}`}
        >
          <span className="text-2xl">📝</span>
          <span className="text-[10px] font-medium">Article</span>
        </button>
        <button
          onClick={() => setActiveTab('assistant')}
          className={`flex flex-col items-center justify-center w-full h-full ${activeTab === 'assistant' ? 'text-blue-600' : 'text-gray-400'}`}
        >
          <span className="text-2xl">🤖</span>
          <span className="text-[10px] font-medium">Assistant</span>
        </button>
      </div>
    </div>
  );
}

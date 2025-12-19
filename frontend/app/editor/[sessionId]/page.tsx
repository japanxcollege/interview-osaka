
/**
 * エディタページ
 * 3パネルレイアウト（原稿・文字起こし・右パネル[Chat/提案]）
 */

'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { InterviewSession, WebSocketMessage } from '@/types';
import { WebSocketClient } from '@/lib/websocket';
import ArticlePanel from '@/components/ArticlePanel';
import TranscriptPanel from '@/components/TranscriptPanel';
import NotesPanel from '@/components/NotesPanel';
import AssistantPanel from '@/components/AssistantPanel'; // New combined panel
import AudioRecorder from '@/components/AudioRecorder';
import { useEditorHistory } from '@/hooks/useEditorHistory'; // New hook
import { Message } from '@/components/AICommandPanel'; // Type definition

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

    const handleMessage = (message: WebSocketMessage) => {
      switch (message.type) {
        case 'initial_data':
          setSession(message.data);
          setIsRecording(message.data.status === 'recording');
          setIsConnected(true);
          // Sync history if needed
          if (content === '' && message.data.article_draft?.text) {
            setContent(message.data.article_draft.text);
          }
          break;

        case 'utterance_added':
          setSession((prev) => prev ? ({ ...prev, transcript: [...prev.transcript, message.data] }) : null);
          break;
        case 'utterance_edited':
          setSession((prev) => prev ? ({ ...prev, transcript: prev.transcript.map(u => u.utterance_id === message.data.utterance_id ? { ...u, ...message.data } : u) }) : null);
          break;
        case 'utterance_deleted':
          setSession((prev) => prev ? ({ ...prev, transcript: prev.transcript.filter(u => u.utterance_id !== message.data.utterance_id) }) : null);
          break;

        case 'note_added':
          setSession((prev) => prev ? ({ ...prev, notes: [...prev.notes, message.data] }) : null);
          break;
        case 'note_deleted':
          setSession((prev) => prev ? ({ ...prev, notes: prev.notes.filter(n => n.note_id !== message.data.note_id) }) : null);
          break;

        case 'article_updated':
          // This comes from other clients or direct updates.
          // We should update our history?
          // If WE made the change, 'content' is already updated.
          // Ideally we check if text is different.
          // For now, if we receive external update, we might want to sync.
          // But 'content' is the source of truth for Editor.
          // Let's assume for now single user.
          setSession((prev) => prev ? ({ ...prev, article_draft: { ...prev.article_draft, text: message.data.text } }) : null);
          break;

        case 'text_improved':
          // Received AI improved text.
          // STOP auto-applying.
          // Add to Chat Messages.
          setIsAIProcessing(false);

          const newAiMessage: Message = {
            id: crypto.randomUUID(),
            role: 'ai',
            content: message.data.improved_text,
            timestamp: new Date()
          };
          setChatMessages(prev => [...prev, newAiMessage]);
          break;

        case 'status_updated':
          setSession((prev) => {
            if (!prev) return null;
            if (message.data.status === 'recording') hasStoppedRef.current = false;
            if (message.data.status === 'editing') hasStoppedRef.current = true;
            return { ...prev, status: message.data.status };
          });
          setIsRecording(message.data.status === 'recording');
          break;

        case 'question_suggested':
          setSession(prev => prev ? ({ ...prev, suggested_questions: [...(prev.suggested_questions || []), message.data.question] }) : null);
          break;

        case 'summary_updated':
          setSession(prev => prev ? ({ ...prev, front_summary: message.data.front_summary, auto_summary: message.data.auto_summary }) : null);
          break;

        case 'ai_counters_updated':
          setSession(prev => prev ? ({ ...prev, pending_ai_article_count: message.data.pending_article_count, pending_ai_question_count: message.data.pending_question_count }) : null);
          break;

        case 'error':
          console.error('WS Error:', message.message);
          setIsAIProcessing(false);
          alert(`エラー: ${message.message}`);
          break;
      }
    };

    fetchSessionFromAPI().then((success) => {
      if (success) {
        wsClient.current = new WebSocketClient(sessionId, handleMessage);
        wsClient.current.connect();
      }
    });

    return () => {
      wsClient.current?.disconnect();
      wsClient.current = null;
    };
  }, [sessionId]); // removed content dependency to avoid re-init loops

  // Handlers
  const handleArticleChange = (newText: string) => {
    // Called when user types in ArticlePanel
    setContent(newText);
    // Sync to backend?
    // We should probably debounce sync to backend, OR ArticlePanel already debounces `onChange`?
    // ArticlePanel.tsx line 100 has debounce.
    wsClient.current?.send('edit_article', { text: newText });
  };

  const handleApplyAI = (text: string) => {
    // User clicked "Apply" in Chat
    setPendingAIContent(text);
  };

  const handleRunAICommand = async (instruction: string, model: 'gemini' | 'claude') => {
    if (!wsClient.current) return null;
    setIsAIProcessing(true);
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
    /* Reuse existing logic */
    // For brevity re-implementing basic toggle
    const endpoint = isRecording ? 'stop-recording' : 'start-recording';
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8005';
      await fetch(`${apiUrl}/api/sessions/${sessionId}/${endpoint}`, { method: 'POST' });
    } catch (e) { console.error(e); }
  };

  if (!session) return <div className="p-10">Loading...</div>;

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="bg-white border-b border-gray-300 px-6 py-4 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold">{session.title}</h1>
          <p className="text-sm text-gray-500">
            {isConnected ? '🟢 接続中' : '🔴 切断'} | {session.status}
          </p>
        </div>
        <div className="flex gap-3">
          <AudioRecorder
            sessionId={sessionId}
            wsClient={wsClient.current}
            isRecording={isRecording}
            speakerId="speaker_web"
            speakerName="Interviewer"
            onError={setRecorderError}
          />
          <button
            onClick={toggleRecording}
            className={`px-4 py-2 rounded text-white ${isRecording ? 'bg-red-500' : 'bg-green-500'}`}
          >
            {isRecording ? 'Stop' : 'Start'}
          </button>
          <button onClick={() => router.push('/')} className="px-4 py-2 bg-gray-200 rounded">Back</button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Article (35%) */}
        <div className="w-[35%] border-r border-gray-300">
          <ArticlePanel
            text={content} // History Content
            lastUpdated={session.article_draft.last_updated}
            onChange={handleArticleChange}
            wsClient={wsClient.current}
            onUndo={undo}
            onRedo={redo}
            canUndo={canUndo}
            canRedo={canRedo}
            onSaveVersion={() => saveSnapshot(`Version ${new Date().toLocaleTimeString()}`)}
            externalAction={pendingAIContent ? { type: 'insert', text: pendingAIContent } : null}
            onActionComplete={() => setPendingAIContent(null)}
            // Pass styles etc
            availableStyles={availableStyles}
            drafts={session.drafts || []}
            activeDraftId={session.article_draft?.draft_id}
          />
        </div>

        {/* Center: Transcript (30%) */}
        <div className="w-[30%] border-r border-gray-300">
          <TranscriptPanel
            transcript={session.transcript}
            onEdit={handleEditUtterance}
            onDelete={handleDeleteUtterance}
            sessionId={sessionId}
          />
        </div>

        {/* Right: Assistant (Chat + Notes + Suggestions) (35%) */}
        <div className="w-[35%] flex flex-col">
          {/* We can put NotesPanel at top or bottom, or inside AssistantPanel tabs?
                Original design had 4 columns. 30/30/20/20.
                Let's keep 4 columns if space permits, or merge Notes/AI.
                User asked for "Right Panel... Chat".
                Let's try 3-column layout: Article | Transcript | Assistant (with Notes tab?)
                Actually NotesPanel is useful.
                Let's stick to 4 columns?
                30% Article, 30% Transcript, 20% Notes, 20% Assistant.
            */}
          <div className="flex h-full">
            <div className="w-1/2 h-full border-r border-gray-300">
              <NotesPanel
                notes={session.notes}
                onAdd={handleAddNote}
                onDelete={handleDeleteNote}
              />
            </div>
            <div className="w-1/2 h-full">
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
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

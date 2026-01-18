'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { InterviewSession, ArticleDraft } from '@/types';
import WriterEditor from '@/components/WriterEditor';
import AICommandPanel, { Message } from '@/components/AICommandPanel';
import RawTranscriptPanel from '@/components/RawTranscriptPanel';

export default function WriterPage() {
    const params = useParams();
    const sessionId = params.sessionId as string;
    const router = useRouter();

    const [session, setSession] = useState<InterviewSession | null>(null);
    const [content, setContent] = useState('');
    const [title, setTitle] = useState('');
    const [isAiProcessing, setIsAiProcessing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [rawTranscript, setRawTranscript] = useState('');

    const [chatMessages, setChatMessages] = useState<Message[]>([]);

    // Load Session
    const fetchSession = useCallback(async () => {
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8005';
            const res = await fetch(`${apiUrl}/api/sessions/${sessionId}`);
            if (!res.ok) throw new Error('Failed to load session');
            const data = await res.json();
            setSession(data);
            setTitle(data.title);
            // Default to article_draft text
            setContent(data.article_draft?.text || '');
        } catch (e) {
            console.error(e);
            alert('セッションの読み込みに失敗しました');
        }
    }, [sessionId]);

    useEffect(() => {
        if (sessionId) fetchSession();
    }, [sessionId, fetchSession]);

    // Command Handler
    const handleAiCommand = async (instruction: string, model: 'gemini' | 'claude') => {
        setIsAiProcessing(true);
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8005';

            const response = await fetch(`${apiUrl}/api/ai/edit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    instruction,
                    selected_text: content,
                    context: `Current Title: ${title}
--------------------------------------------------
Raw Transcript (Pasted):
${rawTranscript}
--------------------------------------------------
Original Session Transcript:
${session?.transcript?.map((u: any) => u.text).join('\n') || ''}`,
                    model_provider: model
                }),
            });

            if (!response.ok) throw new Error('AI request failed');
            const data = await response.json();

            // Add AI response to chat history
            const aiMessage: Message = {
                id: crypto.randomUUID(),
                role: 'ai',
                content: data.text,
                timestamp: new Date()
            };
            setChatMessages(prev => [...prev, aiMessage]);

            // Note: We return the text so AIAssistantPanel knows it succeeded, 
            // but we don't automatically overwrite the editor unless the user clicks "Apply"
            return data.text;

        } catch (error) {
            console.error(error);
            alert('AI処理に失敗しました');
            return null;
        } finally {
            setIsAiProcessing(false);
        }
    };

    const saveContent = useCallback(async (newContent: string, newTitle: string) => {
        setIsSaving(true);
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8005';
            const response = await fetch(`${apiUrl}/api/sessions/${sessionId}/draft`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: newContent }),
            });

            if (!response.ok) {
                throw new Error('Draft save failed');
            }

            // Refresh session to get updated drafts list
            const res = await fetch(`${apiUrl}/api/sessions/${sessionId}`);
            if (res.ok) {
                const data = await res.json();
                setSession(data);
            }
        } catch (e) {
            console.error('Auto-save failed:', e);
        } finally {
            setTimeout(() => setIsSaving(false), 800);
        }
    }, [sessionId]);

    const handleSwitchVersion = async (draftId: string) => {
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
            }
        } catch (e) {
            console.error('Version switch failed', e);
        }
    };

    if (!session) {
        return (
            <div className="flex items-center justify-center h-screen bg-gray-100">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    const handleApply = (text: string) => {
        setContent(text);
        saveContent(text, title);
    };

    return (
        <div className="flex h-screen overflow-hidden bg-gray-50">
            {/* Left: Editor Area (Scrollable) */}
            <div className="flex-1 overflow-y-auto p-8 relative">
                <div className="max-w-4xl mx-auto">
                    {/* Version History Chips */}
                    {session.drafts && session.drafts.length > 1 && (
                        <div className="mb-6 flex items-center gap-2 overflow-x-auto py-2 no-scrollbar border-b border-gray-100">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">History:</span>
                            {session.drafts.map((d, i) => (
                                <button
                                    key={d.draft_id}
                                    onClick={() => handleSwitchVersion(d.draft_id)}
                                    className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all border ${session.article_draft.draft_id === d.draft_id
                                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-md scale-105'
                                            : 'bg-white border-gray-200 text-gray-500 hover:border-indigo-400 hover:text-indigo-600'
                                        }`}
                                >
                                    V{session.drafts.length - i}
                                </button>
                            ))}
                        </div>
                    )}

                    <WriterEditor
                        title={title}
                        content={content}
                        onTitleChange={setTitle}
                        onContentChange={setContent}
                        isSaving={isSaving}
                    />
                </div>
            </div>

            {/* Middle: Raw Transcript Paste Panel */}
            <div className="w-[380px] flex-shrink-0 border-l border-gray-200 bg-white">
                <RawTranscriptPanel
                    value={rawTranscript}
                    onChange={setRawTranscript}
                />
            </div>

            {/* Right: AI Panel (Fixed width) */}
            <div className="w-[420px] flex-shrink-0 relative border-l border-gray-200 shadow-2xl z-30">
                <AICommandPanel
                    onRunCommand={handleAiCommand}
                    isProcessing={isAiProcessing}
                    onApply={handleApply}
                    messages={chatMessages}
                    setMessages={setChatMessages}
                />
            </div>
        </div>
    );
}

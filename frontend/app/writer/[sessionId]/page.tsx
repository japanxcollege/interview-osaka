
'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { InterviewSession } from '@/types';
import WriterEditor from '@/components/WriterEditor';
import AICommandPanel from '@/components/AICommandPanel';

export default function WriterPage() {
    const params = useParams();
    const sessionId = params.sessionId as string;
    const router = useRouter();

    const [session, setSession] = useState<InterviewSession | null>(null);
    const [content, setContent] = useState('');
    const [title, setTitle] = useState('');
    const [isAiProcessing, setIsAiProcessing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Load Session
    useEffect(() => {
        const fetchSession = async () => {
            try {
                const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8005';
                const res = await fetch(`${apiUrl}/api/sessions/${sessionId}`);
                if (!res.ok) throw new Error('Failed to load session');
                const data = await res.json();
                setSession(data);
                setTitle(data.title);
                setContent(data.article_draft?.text || data.transcription_text || ''); // Use draft or full text
            } catch (e) {
                console.error(e);
                alert('セッションの読み込みに失敗しました');
            }
        };
        if (sessionId) fetchSession();
    }, [sessionId]);

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
                    selected_text: content, // Send full content for now as context/target
                    context: `Current Title: ${title}`,
                    model_provider: model
                }),
            });

            if (!response.ok) throw new Error('AI request failed');
            const data = await response.json();

            // Update content with AI result
            setContent(data.text);

            // Save automatically
            saveContent(data.text, title);

        } catch (error) {
            console.error(error);
            alert('AI処理に失敗しました');
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

            // Also save Title if API supported it, currently we only added draft update via this specific endpoint.
            // Title update would strictly require session update endpoint, which we assume is separate or less critical for auto-save.
            // For now, we only save the body text.
        } catch (e) {
            console.error('Auto-save failed:', e);
        } finally {
            setTimeout(() => setIsSaving(false), 800);
        }
    }, [sessionId]);

    if (!session) {
        return (
            <div className="flex items-center justify-center h-screen bg-gray-100">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    return (
        <div className="flex h-screen overflow-hidden">
            {/* Left: Editor (Scrollable) */}
            <div className="flex-1 overflow-y-auto bg-gray-100 p-8">
                <WriterEditor
                    title={title}
                    content={content}
                    onTitleChange={setTitle}
                    onContentChange={setContent}
                    isSaving={isSaving}
                />
            </div>

            {/* Right: AI Panel (Fixed width) */}
            <div className="w-[400px] flex-shrink-0 relative">
                <AICommandPanel
                    onRunCommand={handleAiCommand}
                    isProcessing={isAiProcessing}
                />
            </div>
        </div>
    );
}

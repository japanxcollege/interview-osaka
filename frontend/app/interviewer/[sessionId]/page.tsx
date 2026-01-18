'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { InterviewSession, WebSocketMessage } from '@/types';
import { WebSocketClient } from '@/lib/websocket';
import InterviewerPanel from '@/components/InterviewerPanel';
import ReflectionPanel from '@/components/Interview/ReflectionPanel';

export default function InterviewerPage() {
    const params = useParams();
    const sessionId = params.sessionId as string;
    const router = useRouter();

    const [session, setSession] = useState<InterviewSession | null>(null);
    const [wsClient, setWsClient] = useState<WebSocketClient | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchSession = async () => {
            try {
                const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8005';
                const res = await fetch(`${apiUrl}/api/sessions/${sessionId}`);
                if (!res.ok) throw new Error('Failed to load session');
                const data = await res.json();
                setSession(data);
            } catch (err) {
                console.error(err);
                setError('セッションの読み込みに失敗しました');
            }
        };
        if (sessionId) fetchSession();
    }, [sessionId]);

    useEffect(() => {
        if (!sessionId) return;
        const handleWebSocketMessage = (message: WebSocketMessage) => {
            if (message.type === 'initial_data') {
                setSession(message.data);
            } else if (message.type === 'utterance_added') {
                setSession(prev => {
                    if (!prev) return null;
                    return { ...prev, transcript: [...prev.transcript, message.data] };
                });
            } else if (message.type === 'utterance_edited') {
                setSession(prev => {
                    if (!prev) return null;
                    return {
                        ...prev,
                        transcript: prev.transcript.map(u =>
                            u.utterance_id === message.data.utterance_id
                                ? { ...u, text: message.data.text, speaker_name: message.data.speaker_name }
                                : u
                        )
                    };
                });
            }
        };

        const client = new WebSocketClient(sessionId, handleWebSocketMessage);
        client.connect();
        setWsClient(client);
        return () => client.disconnect();
    }, [sessionId]);

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-gray-50 p-4">
                <div className="bg-white p-8 rounded-xl shadow-md text-center">
                    <h2 className="text-xl font-bold mt-4 text-gray-800">エラーが発生しました</h2>
                    <p className="text-gray-500 mt-2">{error}</p>
                    <button onClick={() => router.push('/')} className="mt-6 px-6 py-2 bg-blue-600 text-white rounded-lg">ホームに戻る</button>
                </div>
            </div>
        );
    }

    if (!session) {
        return (
            <div className="flex items-center justify-center h-screen bg-gray-50">
                <p className="text-gray-500 font-medium">Loading...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4 md:p-8">
            <div className="w-full max-w-7xl h-[90vh]">
                {session.axes_selected && session.axes_selected.length > 0 ? (
                    <ReflectionPanel session={session} wsClient={wsClient} />
                ) : (
                    <InterviewerPanel session={session} wsClient={wsClient} />
                )}
            </div>
        </div>
    );
}

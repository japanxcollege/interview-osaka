'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { InterviewSession, Utterance } from '@/types';
import { WebSocketClient } from '@/lib/websocket';
import AudioRecorder from './AudioRecorder';

interface InterviewerPanelProps {
    session: InterviewSession;
    wsClient: WebSocketClient | null;
}

export default function InterviewerPanel({ session, wsClient }: InterviewerPanelProps) {
    const [messages, setMessages] = useState<{ role: 'ai' | 'user'; text: string }[]>([]);
    const [isRecording, setIsRecording] = useState(false);
    const [isAiProcessing, setIsAiProcessing] = useState(false);
    const [isTtsEnabled, setIsTtsEnabled] = useState(true);
    const [selectedModel, setSelectedModel] = useState<'gemini' | 'claude'>('gemini');
    const [context, setContext] = useState(session.context || '');

    const scrollRef = useRef<HTMLDivElement>(null);
    const lastTranscriptLengthRef = useRef(session.transcript.length);

    // Sync session transcript to messages (filtering for user/interviewer)
    useEffect(() => {
        // If transcript changed, we might want to update our local messages
        // However, for a "Chat" experience, we might want to manage messages separately 
        // or derive from transcript.
        const newMessages = session.transcript.map(u => ({
            role: u.speaker_name === 'Interviewer' ? 'ai' : 'user' as any,
            text: u.text
        }));
        setMessages(newMessages);
    }, [session.transcript]);

    // Auto scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    // Handle AI Response from WebSocket
    useEffect(() => {
        if (!wsClient) return;

        const handleMessage = (event: any) => {
            if (event.type === 'interviewer_response') {
                const aiText = event.data.text;
                setIsAiProcessing(false);
                if (isTtsEnabled) {
                    speak(aiText);
                }
            }
        };

        wsClient.addListener(handleMessage);
        return () => wsClient.removeListener(handleMessage);
    }, [wsClient, isTtsEnabled]);

    const speak = (text: string) => {
        if (typeof window !== 'undefined' && window.speechSynthesis) {
            // Cancel previous
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'ja-JP';
            utterance.rate = 1.0;
            window.speechSynthesis.speak(utterance);
        }
    };

    const triggerAiResponse = () => {
        if (!wsClient) return;
        setIsAiProcessing(true);

        // Convert messages to history for AI
        const history = messages.map(m => ({
            role: m.role === 'ai' ? 'assistant' : 'user',
            content: m.text
        }));

        wsClient.send('interviewer_generate_response', {
            context: context,
            model_provider: selectedModel,
            messages: history
        });
    };

    const toggleRecording = () => {
        if (!isRecording) {
            setIsRecording(true);
        } else {
            setIsRecording(false);
            // When stopping recording, wait a bit for last transcription and then trigger AI
            setTimeout(() => {
                triggerAiResponse();
            }, 1000);
        }
    };

    return (
        <div className="flex flex-col h-full bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
            {/* Header */}
            <div className="bg-gray-50 p-4 border-b border-gray-200 flex justify-between items-center">
                <div>
                    <h2 className="text-lg font-bold text-gray-800">AI Interviewer</h2>
                    <p className="text-xs text-gray-500">Session: {session.title}</p>
                </div>
                <div className="flex items-center gap-4">
                    <select
                        value={selectedModel}
                        onChange={(e) => setSelectedModel(e.target.value as any)}
                        className="text-sm border rounded px-2 py-1 bg-white outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="gemini">Gemini 2.0 Flash</option>
                        <option value="claude">Claude 3.5 Sonnet</option>
                    </select>
                    <button
                        onClick={() => setIsTtsEnabled(!isTtsEnabled)}
                        className={`p-2 rounded-full transition ${isTtsEnabled ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'}`}
                        title={isTtsEnabled ? "音声合成を無効にする" : "音声合成を有効にする"}
                    >
                        {isTtsEnabled ? '🔊' : '🔇'}
                    </button>
                </div>
            </div>

            {/* Chat Area */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50"
            >
                {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 space-y-2">
                        <span className="text-4xl">🎙️</span>
                        <p>録音を開始してインタビューを始めましょう</p>
                        <button
                            onClick={triggerAiResponse}
                            className="mt-2 text-sm text-blue-500 hover:underline"
                        >
                            またはAIから最初の質問をもらう
                        </button>
                    </div>
                )}
                {messages.map((m, i) => (
                    <div key={i} className={`flex ${m.role === 'ai' ? 'justify-start' : 'justify-end'}`}>
                        <div className={`max-w-[80%] p-4 rounded-2xl shadow-sm ${m.role === 'ai'
                                ? 'bg-white border border-gray-100 text-gray-800'
                                : 'bg-blue-600 text-white'
                            }`}>
                            <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.text}</p>
                            {m.role === 'ai' && (
                                <button
                                    onClick={() => speak(m.text)}
                                    className="mt-2 text-[10px] text-gray-400 hover:text-blue-500 flex items-center gap-1"
                                >
                                    <span>▶️ 再生</span>
                                </button>
                            )}
                        </div>
                    </div>
                ))}
                {isAiProcessing && (
                    <div className="flex justify-start">
                        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 italic text-gray-400 text-sm">
                            AIが考えています...
                        </div>
                    </div>
                )}
            </div>

            {/* Controls */}
            <div className="p-6 bg-white border-t border-gray-200">
                <div className="flex flex-col items-center gap-4">
                    <AudioRecorder
                        sessionId={session.session_id}
                        wsClient={wsClient}
                        isRecording={isRecording}
                        speakerId="speaker_user"
                        speakerName="User"
                    />

                    <button
                        onClick={toggleRecording}
                        className={`w-20 h-20 rounded-full flex items-center justify-center text-white transition-all shadow-xl hover:scale-105 active:scale-95 ${isRecording
                                ? 'bg-red-500 animate-pulse'
                                : 'bg-blue-600 hover:bg-blue-700'
                            }`}
                    >
                        {isRecording ? (
                            <span className="text-2xl">⏹️</span>
                        ) : (
                            <span className="text-2xl">🎙️</span>
                        )}
                    </button>

                    <p className="text-sm font-medium text-gray-600">
                        {isRecording ? 'タップして回答を終了' : 'タップして回答を開始'}
                    </p>

                    <div className="w-full mt-4 flex justify-between items-center text-xs text-gray-400 border-t pt-4">
                        <button
                            onClick={() => {
                                const baseUrl = window.location.origin;
                                window.location.href = `${baseUrl}/writer/${session.session_id}`;
                            }}
                            className="hover:text-blue-500 transition font-medium"
                        >
                            ← 編集モードに切り替える
                        </button>
                        <span>音声認識: OpenAI Whisper</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

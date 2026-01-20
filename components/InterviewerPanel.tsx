'use client';

import { useState, useEffect, useRef } from 'react';
import { InterviewSession } from '@/types';
import { WebSocketClient } from '@/lib/websocket';
import WebSpeechRecorder from './Interview/WebSpeechRecorder';
import Toast from './Toast';
import { useToast } from '@/hooks/useToast';

interface InterviewerPanelProps {
    session: InterviewSession;
    wsClient: WebSocketClient | null;
}

export default function InterviewerPanel({ session, wsClient }: InterviewerPanelProps) {
    const [messages, setMessages] = useState<{ role: 'ai' | 'user'; text: string }[]>([]);
    const [isRecording, setIsRecording] = useState(false);
    const [isAiProcessing, setIsAiProcessing] = useState(false);
    const [isTtsEnabled, setIsTtsEnabled] = useState(true);
    const [selectedModel, setSelectedModel] = useState<'gemini' | 'claude' | 'openai'>('openai');
    const [context] = useState(session.context || '');
    const [interimText, setInterimText] = useState('');

    const scrollRef = useRef<HTMLDivElement>(null);

    // Sync session transcript to messages
    useEffect(() => {
        const newMessages = session.transcript.map(u => ({
            role: (['Interviewer', 'AI Interviewer'].includes(u.speaker_name) ? 'ai' : 'user') as 'ai' | 'user',
            text: u.text
        }));
        setMessages(newMessages);
    }, [session.transcript]);

    const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
    const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
    const [speechRate, setSpeechRate] = useState(1.0);
    const [showSettings, setShowSettings] = useState(false);

    // Load available voices
    useEffect(() => {
        const loadVoices = () => {
            if (typeof window === 'undefined') return;
            const allVoices = window.speechSynthesis.getVoices();
            // Filter for Japanese voices, or fallback to all if none found
            const jaVoices = allVoices.filter(v => v.lang.includes('ja'));
            setVoices(jaVoices.length > 0 ? jaVoices : allVoices);

            // Set default voice if available
            if (!selectedVoice && jaVoices.length > 0) {
                setSelectedVoice(jaVoices[0]);
            }
        };

        loadVoices();

        // Browsers load voices asynchronously
        if (typeof window !== 'undefined' && window.speechSynthesis.onvoiceschanged !== undefined) {
            window.speechSynthesis.onvoiceschanged = loadVoices;
        }
    }, [selectedVoice]);

    // Auto scroll
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTo({
                top: scrollRef.current.scrollHeight,
                behavior: 'smooth'
            });
        }
    }, [messages, interimText, isAiProcessing]);

    // AI Response Handler depends on speak
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
    }, [wsClient, isTtsEnabled, selectedVoice, speechRate]); // Add dependencies needed for speak (or just add speak if using callback)

    // Actually, distinct useCallback is better pattern
    const speak = (text: string) => {
        if (typeof window !== 'undefined' && window.speechSynthesis) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'ja-JP';
            if (selectedVoice) {
                utterance.voice = selectedVoice;
            }
            utterance.rate = speechRate;
            window.speechSynthesis.speak(utterance);
        }
    };


    const OPENING_TEMPLATES = [
        { label: '自分の内省', text: 'では、まずご自身の内面についてお聞かせください。最近、ご自身について深く考えたことや、価値観の変化などはありましたか？' },
        { label: '過去の整理', text: 'これまでの歩みを振り返ってみましょう。これまでの人生やキャリアの中で、特に印象に残っている出来事について教えていただけますか？' },
        { label: '未来の展望', text: 'これからの未来についてお話ししましょう。今後挑戦してみたいことや、描いているビジョンについて教えてください。' },
    ];

    const triggerAiResponse = (instruction?: string) => {
        if (!wsClient) return;
        setIsAiProcessing(true);

        const history = messages.map(m => ({
            role: m.role === 'ai' ? 'assistant' : 'user',
            content: m.text
        }));

        wsClient.send('interviewer_generate_response', {
            context: context,
            model_provider: selectedModel,
            ai_mode: session.ai_mode || 'empath',
            messages: history,
            instruction: instruction
        });
    };

    // New function for static template injection
    const injectAiResponse = (text: string) => {
        if (!wsClient) return;
        // Don't set isAiProcessing=true because it's instant
        wsClient.send('inject_ai_response', { text });
    };

    const handleFinalResult = (text: string) => {
        if (!wsClient || !text.trim()) return;

        wsClient.send('user_utterance', {
            text: text,
            speaker_name: 'User',
            context: session.context
        });

        setIsRecording(false);
        setInterimText('');
        setIsAiProcessing(true);
        triggerAiResponse();
    };

    const { toasts, addToast, removeToast } = useToast();

    const handleError = (msg: string) => {
        // alert(msg); // Blocking alert removed
        addToast(msg, 'error', 5000);
        setIsRecording(false);
    };

    const [inputText, setInputText] = useState('');

    const toggleRecording = () => {
        setIsRecording(!isRecording);
    };

    const handleSendText = () => {
        if (!inputText.trim()) return;
        handleFinalResult(inputText);
        setInputText('');
    };

    return (
        <div className="flex flex-col h-full bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/50 overflow-hidden relative">
            <Toast toasts={toasts} removeToast={removeToast} />
            {/* Header */}
            <div className="absolute top-0 left-0 right-0 z-10 bg-white/80 backdrop-blur-md border-b border-gray-100 p-4 flex justify-between items-center h-16">
                <div>
                    <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
                        <span className="text-xl">🤖</span> AI Interviewer
                    </h2>
                </div>
                <div className="flex items-center gap-3">
                    <div className="bg-gray-100/80 rounded-lg p-1 flex text-xs font-medium text-gray-600">
                        <button
                            onClick={() => setSelectedModel('gemini')}
                            className={`px-3 py-1 rounded-md transition-all ${selectedModel === 'gemini' ? 'bg-white shadow text-blue-600' : 'hover:bg-gray-200'}`}
                        >
                            Gemini
                        </button>
                        <button
                            onClick={() => setSelectedModel('claude')}
                            className={`px-3 py-1 rounded-md transition-all ${selectedModel === 'claude' ? 'bg-white shadow text-purple-600' : 'hover:bg-gray-200'}`}
                        >
                            Claude
                        </button>
                        <button
                            onClick={() => setSelectedModel('openai')}
                            className={`px-3 py-1 rounded-md transition-all ${selectedModel === 'openai' ? 'bg-white shadow text-green-600' : 'hover:bg-gray-200'}`}
                        >
                            OpenAI
                        </button>
                    </div>
                    <button
                        onClick={() => setIsTtsEnabled(!isTtsEnabled)}
                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isTtsEnabled ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'}`}
                        title={isTtsEnabled ? "Mute TTS" : "Enable TTS"}
                    >
                        {isTtsEnabled ? '🔊' : '🔇'}
                    </button>

                    {/* TTS Settings Button */}
                    <div className="relative">
                        <button
                            onClick={() => setShowSettings(!showSettings)}
                            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${showSettings ? 'bg-gray-200' : 'hover:bg-gray-100'}`}
                            title="TTS Settings"
                        >
                            ⚙️
                        </button>

                        {/* Settings Popup */}
                        {showSettings && (
                            <div className="absolute right-0 top-10 bg-white rounded-xl shadow-xl border border-gray-200 p-4 w-64 z-50 animate-in fade-in zoom-in-95 duration-200">
                                <h3 className="text-sm font-bold text-gray-700 mb-3">音声設定</h3>

                                <div className="space-y-4">
                                    <div className="space-y-1">
                                        <label className="text-xs text-gray-500">声質</label>
                                        <select
                                            className="w-full text-sm border border-gray-200 rounded-lg p-2 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            value={selectedVoice?.name || ''}
                                            onChange={(e) => {
                                                const voice = voices.find(v => v.name === e.target.value);
                                                if (voice) setSelectedVoice(voice);
                                            }}
                                        >
                                            {voices.map(v => (
                                                <option key={v.name} value={v.name}>{v.name}</option>
                                            ))}
                                            {voices.length === 0 && <option value="">No voices found</option>}
                                        </select>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-xs text-gray-500 flex justify-between">
                                            <span>速さ</span>
                                            <span>{speechRate}x</span>
                                        </label>
                                        <input
                                            type="range"
                                            min="0.5"
                                            max="2.0"
                                            step="0.1"
                                            value={speechRate}
                                            onChange={(e) => setSpeechRate(parseFloat(e.target.value))}
                                            className="w-full accent-blue-500 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Chat Area */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto pt-20 pb-40 px-4 md:px-8 space-y-6 scroll-smooth"
            >
                {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-center space-y-8 opacity-90 mt-10">
                        <div className="w-24 h-24 bg-gradient-to-tr from-blue-100 to-indigo-100 rounded-full flex items-center justify-center animate-pulse">
                            <span className="text-5xl">🎙️</span>
                        </div>
                        <div className="max-w-md">
                            <p className="text-gray-900 font-bold text-xl">インタビューを開始します</p>
                            <p className="text-gray-500 text-sm mt-2">どのように会話を始めますか？</p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-2xl px-4">
                            {OPENING_TEMPLATES.map((template) => (
                                <button
                                    key={template.label}
                                    onClick={() => injectAiResponse(template.text)}
                                    className="bg-white border border-gray-200 hover:border-blue-400 hover:bg-blue-50 text-gray-700 hover:text-blue-700 px-4 py-3 rounded-xl text-sm font-medium transition-all shadow-sm flex flex-col items-center gap-1"
                                >
                                    <span className="text-lg">✨</span>
                                    {template.label}
                                </button>
                            ))}
                        </div>

                        <div className="text-xs text-gray-400">
                            または、マイクをタップして話し始めてください
                        </div>
                    </div>
                )}

                {messages.map((m, i) => (
                    <div key={i} className={`flex ${m.role === 'ai' ? 'justify-start' : 'justify-end'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                        <div className={`
                            max-w-[85%] md:max-w-[75%] p-5 shadow-sm relative group
                            ${m.role === 'ai'
                                ? 'bg-white border border-gray-100 text-gray-800 rounded-2xl rounded-tl-none mr-12'
                                : 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-2xl rounded-tr-none ml-12'
                            }
                        `}>
                            <p className="text-[15px] leading-7 whitespace-pre-wrap">{m.text}</p>
                            {m.role === 'ai' && (
                                <button
                                    onClick={() => speak(m.text)}
                                    className="absolute -right-8 bottom-0 p-1.5 rounded-full text-gray-300 hover:text-blue-500 hover:bg-blue-50 transition opacity-0 group-hover:opacity-100"
                                    title="Replay"
                                >
                                    ▶️
                                </button>
                            )}
                        </div>
                    </div>
                ))}

                {/* Interim Result */}
                {interimText && (
                    <div className="flex justify-end">
                        <div className="max-w-[85%] p-5 rounded-2xl rounded-tr-none bg-blue-500/10 border border-blue-500/20 text-blue-900 ml-12">
                            <p className="text-[15px] leading-7 animate-pulse">{interimText}</p>
                        </div>
                    </div>
                )}

                {/* AI Processing Indicator */}
                {isAiProcessing && (
                    <div className="flex justify-start">
                        <div className="bg-white px-5 py-4 rounded-2xl rounded-tl-none shadow-sm border border-gray-100 flex items-center gap-3">
                            <div className="flex space-x-1">
                                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                                <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce"></div>
                            </div>
                            <span className="text-xs font-medium text-gray-400">Thinking...</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Controls */}
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-white via-white/95 to-transparent z-20">
                <div className="flex flex-col items-center gap-4 max-w-3xl mx-auto w-full">
                    {/* Input Area */}
                    <div className="w-full flex items-end gap-2 px-2">
                        {/* Mic Button (Compact if typing, or main if not) */}
                        <div className="relative shrink-0">
                            <WebSpeechRecorder
                                isRecording={isRecording}
                                onInterimResult={setInterimText}
                                onFinalResult={handleFinalResult}
                                onError={handleError}
                            />
                            {isRecording && (
                                <div className="absolute inset-0 bg-red-500 rounded-full animate-ping opacity-20 transform scale-150"></div>
                            )}
                            <button
                                onClick={toggleRecording}
                                className={`
                                    relative w-12 h-12 rounded-full flex items-center justify-center text-white shadow-lg transition-all duration-300
                                    ${isRecording
                                        ? 'bg-red-500 ring-4 ring-red-100'
                                        : 'bg-blue-600 hover:bg-blue-700'
                                    }
                                `}
                            >
                                {isRecording ? (
                                    <span className="text-xl">⏹️</span>
                                ) : (
                                    <span className="text-xl">🎙️</span>
                                )}
                            </button>
                        </div>

                        {/* Text Input */}
                        <div className="flex-1 bg-gray-100 rounded-2xl flex items-center p-2 border border-transparent focus-within:border-blue-300 focus-within:bg-white transition-all shadow-inner">
                            <input
                                type="text"
                                value={inputText}
                                onChange={(e) => setInputText(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                                        handleSendText();
                                    }
                                }}
                                placeholder={isRecording ? "Listening..." : "メッセージを入力..."}
                                className="flex-1 bg-transparent border-none focus:ring-0 px-2 py-1 text-gray-800 placeholder-gray-400 outline-none w-full"
                                disabled={isRecording}
                            />
                        </div>

                        {/* Send Button */}
                        <button
                            onClick={handleSendText}
                            disabled={!inputText.trim() || isRecording}
                            className={`
                                w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0
                                ${inputText.trim() && !isRecording
                                    ? 'bg-blue-600 text-white shadow-md hover:bg-blue-700 cursor-pointer'
                                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                }
                            `}
                        >
                            <span className="text-sm font-bold">➤</span>
                        </button>
                    </div>

                    <div className="text-center w-full">
                        <button
                            onClick={() => {
                                const baseUrl = window.location.origin;
                                window.location.href = `${baseUrl}/writer/${session.session_id}`;
                            }}
                            className="text-xs font-semibold text-gray-400 hover:text-blue-600 transition flex items-center justify-center gap-1 group mx-auto"
                        >
                            <span className="transform group-hover:-translate-x-1 transition-transform">←</span>
                            Switch to Editor Mode
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

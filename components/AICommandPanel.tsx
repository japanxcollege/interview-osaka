'use client';

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

export interface Message {
    id: string;
    role: 'user' | 'ai';
    content: string;
    timestamp: Date;
}

interface AICommandPanelProps {
    onRunCommand: (instruction: string, model: 'gemini' | 'claude') => Promise<string | null>;
    onApply: (text: string) => void;
    isProcessing: boolean;
    messages: Message[];
    setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
}

export default function AICommandPanel({ onRunCommand, onApply, isProcessing, messages, setMessages }: AICommandPanelProps) {
    const [instruction, setInstruction] = useState('');
    const [selectedModel, setSelectedModel] = useState<'gemini' | 'claude'>('gemini');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const PRESETS = [
        { label: '要約する', prompt: 'この記事を要約してください' },
        { label: '誤字脱字修正', prompt: '誤字脱字を修正し、読みやすくしてください' },
        { label: 'タイトル提案', prompt: 'この記事にふさわしい魅力的なタイトルを5つ提案してください' },
        { label: '箇条書きにする', prompt: '重要なポイントを箇条書きにまとめてください' },
        { label: '言い回しを柔らかく', prompt: '全体的に柔らかく親しみやすいトーンに書き直してください' },
        { label: 'ビジネスライクに', prompt: 'ビジネスシーンに適したフォーマルな文体に書き直してください' },
    ];

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isProcessing]);

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!instruction.trim() || isProcessing) return;

        const currentInstruction = instruction;
        setInstruction(''); // Clear input immediately

        // Add user message
        setMessages(prev => [...prev, {
            id: crypto.randomUUID(),
            role: 'user',
            content: currentInstruction,
            timestamp: new Date()
        }]);

        try {
            const response = await onRunCommand(currentInstruction, selectedModel);

            if (response) {
                setMessages(prev => [...prev, {
                    id: crypto.randomUUID(),
                    role: 'ai',
                    content: response,
                    timestamp: new Date()
                }]);
            }
        } catch (error) {
            console.error(error);
            // Error handling UI could go here
        }
    };

    return (
        <div className="flex flex-col h-full bg-white border-l border-gray-200 shadow-xl z-20 font-sans">
            {/* Header / Model Selector */}
            <div className="p-4 border-b border-gray-200 bg-gray-50/80 backdrop-blur-sm flex-shrink-0">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide flex items-center gap-2">
                        <span className="text-lg">✨</span> AI Assistant
                    </h2>
                    <span className="text-[10px] bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full font-medium">Preview</span>
                </div>
                <div className="flex bg-gray-200/50 p-1 rounded-lg border border-gray-200">
                    <button
                        onClick={() => setSelectedModel('gemini')}
                        className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all duration-200 flex items-center justify-center gap-1.5 ${selectedModel === 'gemini'
                            ? 'bg-white text-blue-600 shadow-sm ring-1 ring-black/5'
                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
                            }`}
                    >
                        <span>Gemini 2.0</span>
                    </button>
                    <button
                        onClick={() => setSelectedModel('claude')}
                        className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all duration-200 flex items-center justify-center gap-1.5 ${selectedModel === 'claude'
                            ? 'bg-white text-purple-600 shadow-sm ring-1 ring-black/5'
                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
                            }`}
                    >
                        <span>Claude 3.5</span>
                    </button>
                </div>
            </div>

            {/* Chat History */}
            <div className="flex-1 p-4 overflow-y-auto bg-gray-50/50 flex flex-col gap-5 scroll-smooth">
                {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-gray-400 space-y-4 opacity-60">
                        <div className="text-5xl grayscale opacity-50">🤖</div>
                        <div className="text-center space-y-1">
                            <p className="text-sm font-medium text-gray-500">How can I help you today?</p>
                            <p className="text-xs text-gray-400 max-w-[200px] mx-auto leading-relaxed">
                                記事の要約、タイトルの提案、誤字脱字の修正など、お任せください。
                            </p>
                        </div>
                    </div>
                )}

                {messages.map((msg) => (
                    <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'} group`}>
                        {/* Avatar */}
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm ${msg.role === 'user'
                            ? 'bg-gradient-to-br from-indigo-500 to-blue-600 text-white'
                            : 'bg-gradient-to-br from-emerald-400 to-teal-500 text-white'
                            }`}>
                            {msg.role === 'user' ? (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                            ) : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                            )}
                        </div>

                        {/* Bubble */}
                        <div className={`flex flex-col max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                            <div className={`rounded-2xl px-4 py-3 text-sm shadow-sm transition-shadow duration-200 ${msg.role === 'user'
                                ? 'bg-indigo-600 text-white rounded-br-sm'
                                : 'bg-white border border-gray-100 text-gray-800 rounded-bl-sm prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0'
                                }`}>
                                {msg.role === 'ai' ? (
                                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                                ) : (
                                    <span className="whitespace-pre-wrap">{msg.content}</span>
                                )}
                            </div>

                            {msg.role === 'ai' && (
                                <div className="flex items-center gap-2 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                    <button
                                        onClick={() => onApply(msg.content)}
                                        className="text-[11px] flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full border border-emerald-200 hover:bg-emerald-100 transition-colors shadow-sm font-medium"
                                    >
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                        反映する
                                    </button>
                                    <span className="text-[10px] text-gray-300">|</span>
                                    <span className="text-[10px] text-gray-400">
                                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                            )}
                            {msg.role === 'user' && (
                                <span className="text-[10px] text-gray-300 mt-1 mr-1">
                                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            )}
                        </div>
                    </div>
                ))}

                {isProcessing && (
                    <div className="flex gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-white flex items-center justify-center flex-shrink-0 animate-pulse shadow-sm">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                        </div>
                        <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm flex items-center gap-2">
                            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 bg-white border-t border-gray-200 flex-shrink-0">
                {/* Presets Chips */}
                <div className="flex gap-2 overflow-x-auto pb-3 no-scrollbar mask-fade-right">
                    {PRESETS.map((preset) => (
                        <button
                            key={preset.label}
                            onClick={() => setInstruction(preset.prompt)}
                            className="flex-shrink-0 px-3 py-1.5 text-[11px] font-medium bg-gray-50 text-gray-600 rounded-full hover:bg-indigo-50 hover:text-indigo-600 transition-all border border-gray-200 hover:border-indigo-200"
                        >
                            {preset.label}
                        </button>
                    ))}
                </div>

                <form onSubmit={handleSubmit} className="relative group">
                    <textarea
                        value={instruction}
                        onChange={(e) => setInstruction(e.target.value)}
                        placeholder="AIへの指示を入力..."
                        className="w-full p-4 pr-12 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white focus:outline-none text-sm resize-none h-[56px] min-h-[56px] max-h-32 transition-all shadow-inner placeholder:text-gray-400"
                        rows={1}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSubmit();
                            }
                        }}
                    />
                    <button
                        type="submit"
                        disabled={isProcessing || !instruction.trim()}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm group-focus-within:shadow-md active:scale-95"
                    >
                        {isProcessing ? (
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
                            </svg>
                        )}
                    </button>
                </form>
                <div className="mt-2 text-[10px] text-center text-gray-300">
                    Use <span className="font-mono bg-gray-100 px-1 rounded">Shift + Enter</span> for new line
                </div>
            </div>
        </div>
    );
}

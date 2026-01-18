'use client';

import { useState } from 'react';
import AICommandPanel, { Message } from './AICommandPanel';
import AISuggestionsPanel, { AIStatus } from './AISuggestionsPanel';

interface AssistantPanelProps {
    onRunCommand: (instruction: string, model: 'gemini' | 'claude') => Promise<string | null>;
    onApply: (text: string) => void;
    isProcessing: boolean;
    messages: Message[];
    setMessages: React.Dispatch<React.SetStateAction<Message[]>>;

    suggestedQuestions: string[];
    frontSummary?: string;
    autoSummary?: string;
    pendingArticleCount?: number;
    pendingQuestionCount?: number;
    aiStatus?: {
        article: AIStatus;
        question: AIStatus;
        general?: AIStatus;
    };
}

export default function AssistantPanel({
    onRunCommand,
    onApply,
    isProcessing,
    messages,
    setMessages,
    suggestedQuestions,
    frontSummary,
    autoSummary,
    pendingArticleCount,
    pendingQuestionCount,
    aiStatus,
}: AssistantPanelProps) {
    const [activeTab, setActiveTab] = useState<'chat' | 'suggest'>('chat');

    // Determine overall processing state for indicator
    const isGeneralProcessing = isProcessing || aiStatus?.general?.status === 'processing';

    return (
        <div className="flex flex-col h-full bg-white border-l border-gray-200">
            {/* Tabs */}
            <div className="flex border-b border-gray-200 px-2 shrink-0 items-center">
                <button
                    onClick={() => setActiveTab('chat')}
                    className={`flex-1 py-3 text-sm font-medium border-b-2 transition ${activeTab === 'chat' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                    AIチャット
                </button>
                <button
                    onClick={() => setActiveTab('suggest')}
                    className={`flex-1 py-3 text-sm font-medium border-b-2 transition ${activeTab === 'suggest' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                    AI提案
                </button>
                {/* Mini Status Indicator */}
                {isGeneralProcessing && (
                    <div className="absolute right-4 top-3 flex items-center gap-1.5 bg-indigo-50 px-2 py-1 rounded-full border border-indigo-100 shadow-sm z-10 pointer-events-none">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                        </span>
                        <span className="text-[10px] font-bold text-indigo-600 animate-pulse">Thinking...</span>
                    </div>
                )}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden relative">
                {activeTab === 'chat' ? (
                    <AICommandPanel
                        onRunCommand={onRunCommand}
                        onApply={onApply}
                        isProcessing={isProcessing}
                        messages={messages}
                        setMessages={setMessages}
                    />
                ) : (
                    <AISuggestionsPanel
                        suggestedQuestions={suggestedQuestions}
                        frontSummary={frontSummary}
                        autoSummary={autoSummary}
                        pendingArticleCount={pendingArticleCount}
                        pendingQuestionCount={pendingQuestionCount}
                        aiStatus={aiStatus}
                    />
                )}
            </div>
        </div>
    );
}

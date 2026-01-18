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

    return (
        <div className="flex flex-col h-full bg-white border-l border-gray-200">
            {/* Tabs */}
            <div className="flex border-b border-gray-200 px-2 shrink-0">
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

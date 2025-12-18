
'use client';

import { useState } from 'react';

interface AICommandPanelProps {
    onRunCommand: (instruction: string, model: 'gemini' | 'claude') => Promise<void>;
    isProcessing: boolean;
}

export default function AICommandPanel({ onRunCommand, isProcessing }: AICommandPanelProps) {
    const [instruction, setInstruction] = useState('');
    const [selectedModel, setSelectedModel] = useState<'gemini' | 'claude'>('gemini');

    const PRESETS = [
        { label: '要約する', prompt: 'この記事を要約してください' },
        { label: '誤字脱字修正', prompt: '誤字脱字を修正し、読みやすくしてください' },
        { label: 'タイトル提案', prompt: 'この記事にふさわしい魅力的なタイトルを5つ提案してください' },
        { label: '箇条書きにする', prompt: '重要なポイントを箇条書きにまとめてください' },
        { label: '言い回しを柔らかく', prompt: '全体的に柔らかく親しみやすいトーンに書き直してください' },
        { label: 'ビジネスライクに', prompt: 'ビジネスシーンに適したフォーマルな文体に書き直してください' },
    ];

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!instruction.trim() || isProcessing) return;
        await onRunCommand(instruction, selectedModel);
        // setInstruction(''); // Keep instruction or clear? Usually keep for tweak.
    };

    return (
        <div className="flex flex-col h-full bg-white border-l border-gray-200 shadow-xl z-10">
            {/* Header / Model Selector */}
            <div className="p-4 border-b border-gray-200 bg-gray-50">
                <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">AI Assistant</h2>
                <div className="flex bg-gray-200 p-1 rounded-lg">
                    <button
                        onClick={() => setSelectedModel('gemini')}
                        className={`flex-1 py-1.5 text-sm font-medium rounded-md transition ${selectedModel === 'gemini' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-800'
                            }`}
                    >
                        Gemini 2.0
                    </button>
                    <button
                        onClick={() => setSelectedModel('claude')}
                        className={`flex-1 py-1.5 text-sm font-medium rounded-md transition ${selectedModel === 'claude' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-600 hover:text-gray-800'
                            }`}
                    >
                        Claude 3.5
                    </button>
                </div>
            </div>

            {/* Output / History (Placeholder for now, maybe show status) */}
            <div className="flex-1 p-4 overflow-y-auto bg-gray-50">
                <p className="text-xs text-gray-400 text-center mt-4">
                    ここにAIとの対話履歴や、生成結果のプレビューが表示されます。<br />
                    （現在は直接エディタに反映されます）
                </p>
            </div>

            {/* Command Input Area */}
            <div className="p-4 bg-white border-t border-gray-200">
                <form onSubmit={handleSubmit} className="mb-4">
                    <label className="block text-xs font-bold text-gray-500 mb-2 uppercase">Custom Instruction</label>
                    <div className="relative">
                        <textarea
                            value={instruction}
                            onChange={(e) => setInstruction(e.target.value)}
                            placeholder="AIへの指示を入力 (例: この段落をもっと具体的にして)"
                            className="w-full p-3 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm resize-none h-24"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                    handleSubmit();
                                }
                            }}
                        />
                        <button
                            type="submit"
                            disabled={isProcessing || !instruction.trim()}
                            className="absolute bottom-2 right-2 p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                            title="送信 (Cmd+Enter)"
                        >
                            {isProcessing ? (
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                </svg>
                            )}
                        </button>
                    </div>
                </form>

                {/* Presets Grid */}
                <div>
                    <label className="block text-xs font-bold text-gray-500 mb-2 uppercase">Presets</label>
                    <div className="grid grid-cols-2 gap-2">
                        {PRESETS.map((preset) => (
                            <button
                                key={preset.label}
                                onClick={() => {
                                    setInstruction(preset.prompt);
                                    // Optional: Auto submit?
                                }}
                                className="p-2 text-left text-xs bg-gray-50 border border-gray-200 rounded hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 transition"
                            >
                                {preset.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

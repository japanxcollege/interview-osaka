"use client";

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';

interface SplitEditorProps {
    factsContent: string;
    feelingsContent: string;
    onFactsChange: (value: string) => void;
    onFeelingsChange: (value: string) => void;
    readOnly?: boolean;
}

export default function SplitEditor({
    factsContent,
    feelingsContent,
    onFactsChange,
    onFeelingsChange,
    readOnly = false
}: SplitEditorProps) {
    const [isPreview, setIsPreview] = useState(false);

    return (
        <div className="flex flex-col h-full bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-sm">
                <div className="flex items-center gap-4 text-sm font-medium text-neutral-400">
                    <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500/50"></span>
                        事実ログ (LEFT)
                    </span>
                    <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-purple-500/50"></span>
                        感情・判断 (RIGHT)
                    </span>
                </div>
                <button
                    onClick={() => setIsPreview(!isPreview)}
                    className={`px-3 py-1 rounded-md text-sm transition-colors ${isPreview
                            ? 'bg-white text-black font-medium'
                            : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
                        }`}
                >
                    {isPreview ? 'Edit Mode' : 'Preview'}
                </button>
            </div>

            {/* Editor Area */}
            <div className="flex-1 flex overflow-hidden">
                {/* Left Pane: Facts */}
                <div className="flex-1 border-r border-neutral-800 overflow-y-auto">
                    {isPreview ? (
                        <div className="p-6 prose prose-invert prose-sm max-w-none">
                            <ReactMarkdown>{factsContent || '*入力なし*'}</ReactMarkdown>
                        </div>
                    ) : (
                        <textarea
                            value={factsContent}
                            onChange={(e) => onFactsChange(e.target.value)}
                            disabled={readOnly}
                            className="w-full h-full p-6 bg-transparent text-white text-base resize-none focus:outline-none placeholder-neutral-700"
                            placeholder="事実・出来事・行動ログ..."
                        />
                    )}
                </div>

                {/* Right Pane: Feelings */}
                <div className="flex-1 overflow-y-auto">
                    {isPreview ? (
                        <div className="p-6 prose prose-invert prose-sm max-w-none">
                            <ReactMarkdown>{feelingsContent || '*入力なし*'}</ReactMarkdown>
                        </div>
                    ) : (
                        <textarea
                            value={feelingsContent}
                            onChange={(e) => onFeelingsChange(e.target.value)}
                            disabled={readOnly}
                            className="w-full h-full p-6 bg-transparent text-white text-base resize-none focus:outline-none placeholder-neutral-700"
                            placeholder="感情・判断・なぜそう思ったか..."
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

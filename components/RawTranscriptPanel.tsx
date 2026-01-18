'use client';

import React from 'react';

interface RawTranscriptPanelProps {
    value: string;
    onChange: (value: string) => void;
}

export default function RawTranscriptPanel({ value, onChange }: RawTranscriptPanelProps) {
    return (
        <div className="flex flex-col h-full bg-white border-r border-gray-200 shadow-sm">
            {/* Header */}
            <div className="p-4 border-b border-gray-200 bg-gray-50/50">
                <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider flex items-center gap-2">
                    <span className="text-lg">📄</span> 文字起こし貼り付け
                </h2>
                <p className="text-[10px] text-gray-400 mt-1 uppercase">Paste raw transcript below for AI context</p>
            </div>

            {/* Textarea Area */}
            <div className="flex-1 p-0 overflow-hidden relative group">
                <textarea
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="ここにインタビューの文字起こしをそのまま貼り付けてください..."
                    className="w-full h-full p-6 text-sm text-gray-700 bg-transparent focus:outline-none resize-none leading-relaxed placeholder:text-gray-300 font-sans custom-scrollbar"
                />

                {/* Subtle decorative elements */}
                <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[10px] text-gray-300 font-mono bg-gray-100 px-2 py-1 rounded">RAW TEXT MODE</span>
                </div>
            </div>

            {/* Footer Info */}
            <div className="px-4 py-2 border-t border-gray-100 bg-gray-50/30">
                <div className="flex justify-between items-center">
                    <span className="text-[10px] text-gray-400 font-medium">
                        {value.length > 0 ? `${value.length.toLocaleString()} characters` : 'Empty'}
                    </span>
                    <button
                        onClick={() => onChange('')}
                        className="text-[10px] text-gray-400 hover:text-red-500 transition-colors uppercase font-bold tracking-tighter"
                    >
                        Clear
                    </button>
                </div>
            </div>
        </div>
    );
}

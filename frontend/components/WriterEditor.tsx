
'use client';

import { useEffect, useRef } from 'react';

interface WriterEditorProps {
    title: string;
    content: string;
    onTitleChange: (title: string) => void;
    onContentChange: (content: string) => void;
    isSaving?: boolean;
}

export default function WriterEditor({
    title,
    content,
    onTitleChange,
    onContentChange,
    isSaving = false
}: WriterEditorProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Auto-resize textarea
    useEffect(() => {
        const textarea = textareaRef.current;
        if (textarea) {
            textarea.style.height = 'auto';
            textarea.style.height = `${textarea.scrollHeight}px`;
        }
    }, [content]);

    return (
        <div className="max-w-3xl mx-auto py-8 px-8 bg-white min-h-[calc(100vh-2rem)] shadow-sm rounded-xl">
            <div className="flex justify-end mb-2">
                <span className={`text-xs text-gray-400 transition-opacity duration-300 ${isSaving ? 'opacity-100' : 'opacity-0'}`}>
                    Saving...
                </span>
            </div>

            {/* Title Input */}
            <input
                type="text"
                value={title}
                onChange={(e) => onTitleChange(e.target.value)}
                placeholder="記事タイトル"
                className="w-full text-4xl font-bold text-gray-800 placeholder-gray-300 border-none focus:ring-0 focus:outline-none mb-6 p-0"
            />

            {/* Body Input */}
            <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => onContentChange(e.target.value)}
                placeholder="ここに記事を書いてください... (Markdown形式対応)"
                className="w-full text-lg leading-relaxed text-gray-700 placeholder-gray-300 border-none focus:ring-0 focus:outline-none resize-none min-h-[60vh] p-0"
                style={{ overflow: 'hidden' }}
            />
        </div>
    );
}

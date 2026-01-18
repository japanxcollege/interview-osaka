
'use client';

import { useEffect, useRef } from 'react';


interface WriterEditorProps {
    title: string;
    content: string;
    onTitleChange: (title: string) => void;
    onContentChange: (content: string) => void;
    isSaving?: boolean;
    onUndo?: () => void;
    onRedo?: () => void;
    canUndo?: boolean;
    canRedo?: boolean;
    onSaveVersion?: () => void;
}

export default function WriterEditor(props: WriterEditorProps) {
    const {
        title,
        content,
        onTitleChange,
        onContentChange,
        isSaving = false
    } = props;
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
        <div className="max-w-3xl mx-auto py-8 px-8 bg-white min-h-[calc(100vh-2rem)] shadow-sm rounded-xl relative">
            {/* Toolbar */}
            <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-2">
                <div className="flex items-center gap-2">
                    <button
                        onClick={props.onUndo}
                        disabled={!props.canUndo}
                        className="p-1.5 text-gray-500 hover:text-gray-700 disabled:opacity-30 disabled:hover:text-gray-500 rounded transition"
                        title="元に戻す (Cmd+Z)"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                    </button>
                    <button
                        onClick={props.onRedo}
                        disabled={!props.canRedo}
                        className="p-1.5 text-gray-500 hover:text-gray-700 disabled:opacity-30 disabled:hover:text-gray-500 rounded transition"
                        title="やり直す (Cmd+Shift+Z)"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" /></svg>
                    </button>
                    {props.onSaveVersion && (
                        <button
                            onClick={() => props.onSaveVersion?.()}
                            className="ml-2 px-3 py-1 text-xs bg-gray-100 text-gray-700 hover:bg-gray-200 rounded transition flex items-center gap-1"
                            title="現在の状態をバージョンとして保存"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                            Save Version
                        </button>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    <span className={`text-xs text-gray-400 transition-opacity duration-300 ${isSaving ? 'opacity-100' : 'opacity-0'}`}>
                        Auto Saving...
                    </span>
                    {/* Snapshot History Dropdown could go here */}
                </div>
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


'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone'; // Note: might need to install or implement manually if not available.
// I'll implement a manual drag-drop to avoid dependency issues if react-dropzone is missing.

export default function FileUploader({ onUploadComplete }: { onUploadComplete: (sessionId: string) => void }) {
    const [isDragOver, setIsDragOver] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Basic Fields
    const [title, setTitle] = useState('');
    const [prompt, setPrompt] = useState('これは日本語のインタビューです。');

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            uploadFile(e.dataTransfer.files[0]);
        }
    }, [title, prompt]); // Dependencies for uploadFile will be handled inside or refs

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            uploadFile(e.target.files[0]);
        }
    };

    const uploadFile = async (file: File) => {
        if (!file.type.startsWith('audio/') && !file.type.startsWith('video/')) {
            // Simple validation
            // setError('音声または動画ファイルのみアップロード可能です');
            // Accept common formats anyway
        }

        setIsUploading(true);
        setError(null);

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('title', title || file.name);
            formData.append('prompt', prompt);

            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8005';
            const response = await fetch(`${apiUrl}/api/sessions/upload`, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                throw new Error('Upload failed');
            }

            const session = await response.json();
            onUploadComplete(session.session_id);

        } catch (err) {
            console.error(err);
            setError('アップロードに失敗しました。サーバーの状態を確認してください。');
            setIsUploading(false);
        }
    };

    return (
        <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100">
            {/* Settings Form */}
            <div className="mb-6 space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        データ名（セッションタイトル）
                    </label>
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="例: 2024-04 〇〇さんインタビュー"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        disabled={isUploading}
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Initial Prompt（文字起こしのヒント）
                    </label>
                    <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="専門用語や話者の名前などを入力しておくと精度が上がります"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none h-24 text-sm"
                        disabled={isUploading}
                    />
                </div>
            </div>

            {/* Drop Zone */}
            <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`
          relative border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer
          ${isDragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
          ${isUploading ? 'opacity-50 pointer-events-none' : ''}
        `}
            >
                <input
                    type="file"
                    accept="audio/*,video/*"
                    onChange={handleFileSelect}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    disabled={isUploading}
                />

                <div className="flex flex-col items-center justify-center gap-3">
                    {isUploading ? (
                        <>
                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500"></div>
                            <p className="text-blue-600 font-medium">アップロード＆処理中...</p>
                            <p className="text-xs text-gray-500">ファイルのサイズによっては時間がかかります</p>
                        </>
                    ) : (
                        <>
                            <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-2xl">
                                📂
                            </div>
                            <div>
                                <p className="font-medium text-gray-700">
                                    ファイルを選択 または ドラッグ＆ドロップ
                                </p>
                                <p className="text-xs text-gray-500 mt-1">
                                    MP3, M4A, WAV, MP4など (最大25MB推奨)
                                </p>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {error && (
                <div className="mt-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2">
                    <span>⚠️</span>
                    {error}
                </div>
            )}
        </div>
    );
}

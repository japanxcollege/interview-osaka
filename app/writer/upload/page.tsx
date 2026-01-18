
'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useDropzone } from 'react-dropzone';

type WizardStep = 'config' | 'processing' | 'generating';

export default function UploadWizardPage() {
    const router = useRouter();
    const [step, setStep] = useState<WizardStep>('config');

    // Config State
    const [title, setTitle] = useState('');
    const [prompt, setPrompt] = useState('これは日本語のインタビューです。');
    const [hotwords, setHotwords] = useState('');
    const [style, setStyle] = useState('qa');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [availableStyles, setAvailableStyles] = useState<any[]>([]);

    // Processing State
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [progress, setProgress] = useState(0);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [keyPoints, setKeyPoints] = useState('');
    const [context, setContext] = useState('');

    // Handlers
    const handleFileSelect = (file: File) => {
        setSelectedFile(file);
        if (!title) setTitle(file.name.replace(/\.[^/.]+$/, "")); // Auto title
    };

    // Dropzone logic
    const onDrop = useCallback((acceptedFiles: File[]) => {
        if (acceptedFiles?.length > 0) {
            handleFileSelect(acceptedFiles[0]);
        }
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'audio/*': [],
            'video/*': []
        },
        maxFiles: 1,
        multiple: false
    });

    useEffect(() => {
        const fetchStyles = async () => {
            try {
                const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8005';
                const res = await fetch(`${apiUrl}/api/styles`);
                if (res.ok) {
                    const data = await res.json();
                    setAvailableStyles(data);
                    if (data.length > 0 && !style) setStyle(data[0].id);
                }
            } catch (e) {
                console.error("Failed to fetch styles", e);
                // Fallback
                setAvailableStyles([
                    { id: 'qa', name: '対談・Q&A', description: '質問と回答を明確に分けます' },
                    { id: 'narrative', name: '一人称・エッセイ', description: '「私」の視点で語ります' },
                    { id: 'summary', name: 'レポート・要約', description: '三人称で要点をまとめます' }
                ]);
            }
        };
        fetchStyles();
    }, []);

    const startUpload = async () => {
        if (!selectedFile) return;

        setStep('processing');
        setProgress(5);
        setUploadError(null); // Clear previous errors

        try {
            const formData = new FormData();
            formData.append('file', selectedFile);
            formData.append('title', title);
            formData.append('prompt', prompt);
            formData.append('hotwords', hotwords);
            formData.append('style', style);

            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8005';
            const res = await fetch(`${apiUrl}/api/sessions/upload`, {
                method: 'POST',
                body: formData,
            });

            if (!res.ok) throw new Error('Upload failed');
            const session = await res.json();
            setSessionId(session.session_id);

        } catch (e) {
            console.error(e);
            setUploadError('アップロード開始に失敗しました。');
            // Keep on processing step to show error? or go back?
            // Actually catching start failure immediately is fine, but polling handles the async failures.
        }
    };

    // Polling Progress (Step 2)
    useEffect(() => {
        if (step !== 'processing' || !sessionId) return;

        const interval = setInterval(async () => {
            try {
                const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8005';
                const res = await fetch(`${apiUrl}/api/sessions/${sessionId}`);
                if (res.ok) {
                    const session = await res.json();

                    // Check for Error
                    if (session.upload_error) {
                        setUploadError(session.upload_error);
                        clearInterval(interval);
                        return;
                    }
                    if (session.upload_progress < 0) {
                        setUploadError("不明なエラーが発生しました (Progress < 0)");
                        clearInterval(interval);
                        return;
                    }

                    const sProgress = session.upload_progress || 0;
                    setProgress(sProgress);
                }
            } catch (e) {
                console.error('Polling error', e);
            }
        }, 2000);

        return () => clearInterval(interval);
    }, [step, sessionId]);

    // Update Key Points & Context (Step 2 Interactivity)
    const sendWizardData = async () => {
        if (!sessionId) return;
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8005';
            await fetch(`${apiUrl}/api/sessions/${sessionId}/wizard`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    key_points: keyPoints.split('\n').filter(Boolean),
                    context: context
                })
            });
        } catch (e) { console.error(e); }
    };

    // Trigger Generation (Step 3)
    const handleGenerate = async () => {
        if (!sessionId) return;

        // Send final keypoints just in case
        await sendWizardData();

        setStep('generating');
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8005';
            const res = await fetch(`${apiUrl}/api/sessions/${sessionId}/generate`, {
                method: 'POST'
            });
            if (!res.ok) throw new Error('Generation failed');

            router.push(`/writer/${sessionId}`);

        } catch (e) {
            console.error(e);
            alert('生成に失敗しました');
            setStep('processing'); // Go back?
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center py-12 px-4">
            <div className="max-w-3xl w-full bg-white rounded-2xl shadow-xl overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white text-center relative">
                    <button onClick={() => router.push('/')} className="absolute left-6 top-1/2 -translate-y-1/2 text-white/80 hover:text-white font-bold text-sm">
                        ← Home
                    </button>
                    <h1 className="text-2xl font-bold">New Article Wizard</h1>
                    <p className="opacity-90 text-sm">音声ファイルから記事を自動生成します</p>
                </div>

                {/* Step Indicator */}
                <div className="flex border-b border-gray-200">
                    {['設定', '解析＆入力', '生成'].map((label, i) => {
                        const stepIdx = ['config', 'processing', 'generating'].indexOf(step);
                        const active = stepIdx === i;
                        const completed = stepIdx > i;
                        return (
                            <div key={label} className={`flex-1 py-3 text-center text-sm font-medium ${active ? 'text-blue-600 border-b-2 border-blue-600' : completed ? 'text-green-600' : 'text-gray-400'}`}>
                                {completed ? '✓ ' : ''}{label}
                            </div>
                        );
                    })}
                </div>

                <div className="p-8">
                    {/* STEP 1: CONFIG */}
                    {step === 'config' && (
                        <div className="space-y-8">
                            {/* File Drop Area */}
                            <div
                                {...getRootProps()}
                                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200 outline-none
                                    ${isDragActive
                                        ? 'border-blue-500 bg-blue-50 scale-102 ring-4 ring-blue-100'
                                        : selectedFile
                                            ? 'border-blue-500 bg-blue-50/30'
                                            : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                                    }`}
                            >
                                <input {...getInputProps()} />
                                <div className={`text-4xl mb-2 transition-transform duration-200 ${isDragActive ? 'scale-110' : ''}`}>
                                    {selectedFile ? '🎵' : '📂'}
                                </div>
                                <p className="font-bold text-gray-700">
                                    {isDragActive
                                        ? "ファイルをドロップしてアップロード"
                                        : selectedFile
                                            ? selectedFile.name
                                            : "音声/動画ファイルを選択"
                                    }
                                </p>
                                <p className="text-xs text-gray-500 mt-2">
                                    {selectedFile
                                        ? "クリックまたはドラッグして変更"
                                        : "ここにファイルをドラッグ＆ドロップ、またはクリックして選択"
                                    }
                                </p>
                            </div>

                            {/* Style Selection */}
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-3">記事スタイル</label>
                                <div className="grid grid-cols-3 gap-4">
                                    {availableStyles.map((s) => (
                                        <button
                                            key={s.id}
                                            onClick={() => setStyle(s.id)}
                                            className={`p-4 rounded-xl border text-left transition ${style === s.id ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' : 'border-gray-200 hover:border-gray-300'}`}
                                        >
                                            <div className="font-bold text-gray-900">{s.name || s.label}</div>
                                            <div className="text-xs text-gray-500 mt-1">{s.description || s.desc}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Metadata */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">タイトル (仮)</label>
                                    <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none" placeholder="例: 〇〇さんインタビュー" />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">ホットワード (カンマ区切り)</label>
                                    <input type="text" value={hotwords} onChange={e => setHotwords(e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none" placeholder="例: DAO, NFT, 大阪" />
                                    <p className="text-xs text-gray-400 mt-1">専門用語を登録すると認識精度が向上します</p>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">コンテキスト・事前情報（文字起こしには含まれません）</label>
                                <textarea
                                    value={prompt}
                                    onChange={e => setPrompt(e.target.value)}
                                    className="w-full h-24 p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                    placeholder="用語: DAO, NFT, Ethereum...&#13;&#10;直前の会話: ...&#13;&#10;これらはAIの認識精度向上のためのヒントとして使われます。"
                                />
                            </div>

                            <button
                                onClick={startUpload}
                                disabled={!selectedFile || !title}
                                className="w-full py-4 bg-blue-600 text-white font-bold rounded-xl shadow-lg hover:bg-blue-700 disabled:opacity-50 transition"
                            >
                                アップロードして解析開始
                            </button>
                        </div>
                    )}

                    {/* STEP 2: PROCESSING & HUMAN INPUT */}
                    {step === 'processing' && (
                        <div className="space-y-8 animate-fade-in">
                            {/* Error State */}
                            {uploadError ? (
                                <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
                                    <div className="text-4xl mb-4">😢</div>
                                    <h3 className="text-lg font-bold text-red-700 mb-2">解析エラーが発生しました</h3>
                                    <p className="text-red-600 mb-6 font-mono text-sm bg-red-100/50 p-2 rounded inline-block">
                                        {uploadError}
                                    </p>
                                    <button
                                        onClick={() => setStep('config')}
                                        className="px-6 py-2 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 text-gray-700 font-bold"
                                    >
                                        戻ってもう一度試す
                                    </button>
                                </div>
                            ) : (
                                /* Normal Progress */
                                <div className="text-center">
                                    <div className="relative w-full h-4 bg-gray-200 rounded-full overflow-hidden mb-2">
                                        <div className="absolute top-0 left-0 h-full bg-blue-500 transition-all duration-500" style={{ width: `${progress}%` }}>
                                            <div className="absolute top-0 right-0 h-full w-full animate-pulse bg-white/20"></div>
                                        </div>
                                    </div>
                                    <p className="text-sm font-bold text-blue-600">
                                        {progress < 100 ? 'AIが音声を解析中...' : '解析完了！ 準備ができました'}
                                    </p>
                                    <p className="text-xs text-gray-400">({progress}%)</p>
                                </div>
                            )}

                            {/* Human Input Form (Only show if no error) */}
                            {!uploadError && (
                                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 space-y-6">
                                    <div className="flex items-start gap-3 mb-4">
                                        <span className="text-2xl">💡</span>
                                        <div>
                                            <h3 className="font-bold text-gray-800">待ち時間を有効活用しましょう</h3>
                                            <p className="text-xs text-gray-600">ここで入力した内容は、AIが記事を書く際に**最優先**で反映されます。</p>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-2">① 記事に必ず含めたいポイント（箇条書きに最適）</label>
                                        <textarea
                                            value={keyPoints}
                                            onChange={(e) => setKeyPoints(e.target.value)}
                                            onBlur={sendWizardData} // Auto save on blur
                                            className="w-full h-24 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 outline-none text-sm"
                                            placeholder="・〇〇というエピソードは感動的だった&#13;&#10;・「継続は力なり」という言葉を強調したい&#13;&#10;・後半のビジネスの話を中心にまとめたい"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-2">② メモ・事前情報・背景（自由に記述）</label>
                                        <textarea
                                            value={context}
                                            onChange={(e) => setContext(e.target.value)}
                                            onBlur={sendWizardData} // Auto save on blur
                                            className="w-full h-40 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 outline-none text-sm"
                                            placeholder="ここにインタビュー中のメモや、事前に共有されたテキスト、背景情報などをそのまま貼り付けてください。AIがこれを読み込んで記事作成の参考にします。"
                                        />
                                    </div>

                                    <p className="text-xs text-gray-400 text-right mt-1">入力が終わったらフォーム外をクリックで自動保存されます</p>
                                </div>
                            )}

                            {!uploadError && (
                                <button
                                    onClick={handleGenerate}
                                    disabled={progress < 100}
                                    className={`w-full py-4 font-bold rounded-xl shadow-lg transition flex items-center justify-center gap-2 ${progress < 100 ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700 animate-bounce-soft'}`}
                                >
                                    {progress < 100 ? (
                                        <><span>⏳</span> 解析待ち...</>
                                    ) : (
                                        <><span>✨</span> 記事ドラフトを生成する</>
                                    )}
                                </button>
                            )}
                        </div>
                    )}


                    {/* STEP 3: GENERATING */}
                    {step === 'generating' && (
                        <div className="text-center py-12">
                            <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-6"></div>
                            <h2 className="text-2xl font-bold text-gray-800 mb-2">AIが執筆中...</h2>
                            <p className="text-gray-500">あなたの入力したポイントを元に、<br />素敵な記事に仕上げています。</p>
                            <p className="text-xs text-gray-400 mt-8">数秒〜数十秒お待ちください</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

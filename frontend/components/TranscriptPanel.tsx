/**
 * 文字起こしパネル（中央）
 * リアルタイムで発話を表示
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { Utterance } from '@/types';

interface TranscriptPanelProps {
  transcript: Utterance[];
  onEdit?: (utteranceId: string, newText: string, newSpeakerName: string) => void;
  onDelete?: (utteranceId: string) => void;
  sessionId?: string; // Optional for backward compat, but needed for import
}

export default function TranscriptPanel({ transcript, onEdit, onDelete, sessionId }: TranscriptPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editSpeaker, setEditSpeaker] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !sessionId) return;

    if (!confirm(`「${file.name}」をインポートしますか？\n（文字起こしが現在のリストの最後に追加されます）`)) {
      e.target.value = '';
      return;
    }

    setIsImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8005';
      const res = await fetch(`${apiUrl}/api/sessions/${sessionId}/import`, {
        method: 'POST',
        body: formData
      });

      if (!res.ok) throw new Error('Import failed');
      alert('インポートを開始しました。完了までお待ちください。');
    } catch (err) {
      console.error(err);
      alert('インポートに失敗しました');
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // 新しい発話が追加されたら自動スクロール
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  const startEdit = (utterance: Utterance) => {
    setEditingId(utterance.utterance_id);
    setEditText(utterance.text);
    setEditSpeaker(utterance.speaker_name);
  };

  const saveEdit = (utteranceId: string) => {
    if (onEdit && editText.trim()) {
      onEdit(utteranceId, editText.trim(), editSpeaker.trim());
    }
    setEditingId(null);
    setEditText('');
    setEditSpeaker('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText('');
    setEditSpeaker('');
  };

  const handleDelete = (utteranceId: string) => {
    if (confirm('この発話を削除しますか？')) {
      onDelete?.(utteranceId);
    }
  };

  return (
    <div className="flex flex-col h-full border-r border-gray-300">
      {/* ヘッダー */}
      <div className="p-4 border-b border-gray-300 bg-gray-50 flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold">🎤 文字起こし</h2>
          <p className="text-xs text-gray-500 mt-1">
            発話数: {transcript.length} {isImporting && <span className="text-blue-600 animate-pulse ml-2">📥 インポート中...</span>}
          </p>
        </div>
        <div className="flex gap-2">
          {sessionId && (
            <>
              <input
                type="file"
                accept="audio/*,video/*"
                ref={fileInputRef}
                className="hidden"
                onChange={handleFileChange}
              />
              <button
                onClick={handleImportClick}
                disabled={isImporting}
                className="px-3 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50 transition flex items-center gap-1 disabled:opacity-50"
                title="音声ファイルをインポート"
              >
                <span>📂</span> {isImporting ? '...' : 'インポート'}
              </button>
            </>
          )}
          <button
            onClick={() => {
              const lines: string[] = [];

              // Header
              lines.push(`# 会議メモ - ${new Date().toLocaleString('ja-JP')}`);
              lines.push('');
              lines.push('## 📋 セッション情報');
              const startTime = transcript.length > 0 ? new Date(transcript[0].timestamp).toLocaleTimeString() : '---';
              const endTime = transcript.length > 0 ? new Date(transcript[transcript.length - 1].timestamp).toLocaleTimeString() : '---';
              const participants = Array.from(new Set(transcript.map(u => u.speaker_name))).join(', ');

              lines.push(`- **開始**: ${startTime}`);
              lines.push(`- **終了**: ${endTime}`);
              lines.push(`- **参加者**: ${participants}`);
              lines.push('');
              lines.push('---');
              lines.push('');
              lines.push('## 💬 会話ログ');
              lines.push('');

              // Transcripts
              transcript.forEach(u => {
                const time = new Date(u.timestamp).toLocaleTimeString('ja-JP');
                lines.push(`### ${time} - ${u.speaker_name}`);
                lines.push(u.text);
                lines.push('');
              });

              // Statistics
              lines.push('---');
              lines.push('');
              lines.push('## 📊 統計');
              lines.push(`- 発話数: ${transcript.length}件`);

              // Copy to clipboard
              navigator.clipboard.writeText(lines.join('\n'))
                .then(() => alert('クリップボードにコピーしました！'))
                .catch(err => console.error('Copy failed:', err));
            }}
            className="px-3 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50 transition flex items-center gap-1"
            title="議事録形式でコピー"
          >
            <span>📋</span> コピー
          </button>
        </div>
      </div>

      {/* 発話リスト */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {transcript.length === 0 ? (
          <div className="text-center text-gray-400 mt-8">
            <p>まだ発話がありません</p>
            <p className="text-xs mt-2">録音を開始すると、ここに文字起こしが表示されます</p>
          </div>
        ) : (
          transcript.map((utterance, index) => (
            <div
              key={`${utterance.utterance_id}-${utterance.timestamp}-${index}`}
              className="group flex gap-3 hover:bg-gray-50 p-2 rounded transition"
            >
              {/* 話者アイコン */}
              <div className="flex-shrink-0">
                <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">
                  {editingId === utterance.utterance_id ? editSpeaker.charAt(0) : utterance.speaker_name.charAt(0)}
                </div>
              </div>

              {/* 発話内容 */}
              <div className="flex-1">
                {editingId === utterance.utterance_id ? (
                  /* 編集モード */
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={editSpeaker}
                      onChange={(e) => setEditSpeaker(e.target.value)}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm font-semibold"
                      placeholder="話者名"
                    />
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm resize-none"
                      rows={3}
                      placeholder="発話内容"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveEdit(utterance.utterance_id)}
                        className="px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 transition"
                      >
                        保存
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="px-3 py-1 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300 transition"
                      >
                        キャンセル
                      </button>
                    </div>
                  </div>
                ) : (
                  /* 表示モード */
                  <>
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="font-semibold text-sm">{utterance.speaker_name}</span>
                      <span className="text-xs text-gray-500">
                        {new Date(utterance.timestamp).toLocaleTimeString('ja-JP')}
                      </span>
                      {/* 編集・削除ボタン */}
                      <div className="ml-auto opacity-0 group-hover:opacity-100 transition flex gap-1">
                        <button
                          onClick={() => startEdit(utterance)}
                          className="p-1 text-blue-600 hover:bg-blue-50 rounded transition"
                          title="編集"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDelete(utterance.utterance_id)}
                          className="p-1 text-red-600 hover:bg-red-50 rounded transition"
                          title="削除"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    <p className="text-sm text-gray-800">{utterance.text}</p>
                  </>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

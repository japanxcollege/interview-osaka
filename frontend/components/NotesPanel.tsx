/**
 * メモパネル（右）
 * メモの追加・削除
 */

'use client';

import { useMemo, useState } from 'react';
import { Note } from '@/types';

interface NotesPanelProps {
  notes: Note[];
  onAdd: (text: string) => void;
  onDelete: (noteId: string) => void;
}

export default function NotesPanel({ notes, onAdd, onDelete }: NotesPanelProps) {
  const [newNoteText, setNewNoteText] = useState('');
  const [sortOption, setSortOption] = useState<'newest' | 'oldest' | 'alphabetical'>('newest');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newNoteText.trim()) {
      onAdd(newNoteText.trim());
      setNewNoteText('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Cmd/Ctrl + Enter でメモを追加
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (newNoteText.trim()) {
        onAdd(newNoteText.trim());
        setNewNoteText('');
      }
    }
  };

  const sortedNotes = useMemo(() => {
    const cloned = [...notes];
    switch (sortOption) {
      case 'alphabetical':
        return cloned.sort((a, b) => a.text.localeCompare(b.text, 'ja'));
      case 'oldest':
        return cloned.sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
      case 'newest':
      default:
        return cloned.sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
    }
  }, [notes, sortOption]);

  return (
    <div className="flex flex-col h-full">
      {/* ヘッダー */}
      <div className="p-4 border-b border-gray-300 bg-gray-50">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">📌 メモ</h2>
            <p className="text-xs text-gray-500 mt-1">メモ数: {notes.length}</p>
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <span>並び替え:</span>
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as typeof sortOption)}
              className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
            >
              <option value="newest">新しい順</option>
              <option value="oldest">古い順</option>
              <option value="alphabetical">あいうえお順</option>
            </select>
          </label>
        </div>
      </div>

      {/* メモ入力フォーム */}
      <div className="p-4 border-b border-gray-300">
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <textarea
            value={newNoteText}
            onChange={(e) => setNewNoteText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="メモを追加... (⌘/Ctrl+Enterで送信)"
            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none"
            rows={3}
          />
          <button
            type="submit"
            className="self-end px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition text-sm font-medium"
          >
            追加
          </button>
        </form>
      </div>

      {/* メモリスト */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {notes.length === 0 ? (
          <div className="text-center text-gray-400 mt-8">
            <p>まだメモがありません</p>
            <p className="text-xs mt-2">気になったことをメモしましょう</p>
          </div>
        ) : (
          sortedNotes.map((note) => (
            <div
              key={note.note_id}
              className="p-3 bg-yellow-50 border border-yellow-200 rounded shadow-sm"
            >
              <div className="flex justify-between items-start gap-2 mb-1">
                <span className="text-xs text-gray-500">
                  {new Date(note.timestamp).toLocaleString('ja-JP')}
                </span>
                <button
                  onClick={() => onDelete(note.note_id)}
                  className="text-red-500 hover:text-red-700 text-xs font-medium"
                >
                  削除
                </button>
              </div>
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{note.text}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

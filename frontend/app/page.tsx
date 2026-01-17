/**
 * ホームページ
 * セッション一覧と新規作成
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { InterviewSession } from '@/types';

export default function HomePage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newSessionTitle, setNewSessionTitle] = useState('');

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8005';
      const response = await fetch(`${apiUrl}/api/sessions`);
      if (!response.ok) {
        throw new Error('Failed to fetch sessions');
      }
      const data = await response.json();
      setSessions(data);
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
      alert('セッション一覧の取得に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  const createSession = async () => {
    if (!newSessionTitle.trim()) {
      alert('タイトルを入力してください');
      return;
    }

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8005';
      const response = await fetch(`${apiUrl}/api/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: newSessionTitle }),
      });

      if (!response.ok) {
        throw new Error('Failed to create session');
      }

      const session = await response.json();
      const redirectType = (window as any).__redirectType || 'editor';
      if (redirectType === 'interviewer') {
        router.push(`/interviewer/${session.session_id}`);
      } else {
        router.push(`/editor/${session.session_id}`);
      }
    } catch (error) {
      console.error('Failed to create session:', error);
      alert('セッションの作成に失敗しました');
    }
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      preparing: { text: '準備中', color: 'bg-gray-200 text-gray-700' },
      recording: { text: '録音中', color: 'bg-red-100 text-red-700' },
      editing: { text: '編集中', color: 'bg-blue-100 text-blue-700' },
      completed: { text: '完了', color: 'bg-green-100 text-green-700' },
    };
    const badge = badges[status as keyof typeof badges] || badges.preparing;
    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${badge.color}`}>
        {badge.text}
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-6 flex justification-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Interview Editor</h1>
            <p className="text-gray-500 mt-1">Phase 0 - リアルタイムインタビューエディター</p>
          </div>
          <button
            onClick={() => router.push('/admin/prompts')}
            className="text-gray-400 hover:text-gray-600 p-2 rounded-full hover:bg-gray-100 transition"
            title="管理者設定"
          >
            <span className="text-xl">⚙️</span>
          </button>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* アクションエリア */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-semibold text-gray-800">セッション一覧</h2>
          <div className="flex gap-3">
            <button
              onClick={() => router.push('/writer/upload')}
              className="flex-1 bg-white border border-gray-300 text-gray-700 p-4 rounded-lg shadow-sm hover:shadow-md transition flex flex-col items-center justify-center gap-2"
            >
              <span className="text-2xl">📂</span>
              <span className="font-bold">文字起こしから作成</span>
              <span className="text-xs text-gray-500">音声ファイルをアップロード</span>
            </button>

            <button
              onClick={() => {
                setShowCreateModal(true);
                (window as any).__redirectType = 'interviewer';
              }}
              className="flex-1 bg-gradient-to-br from-indigo-600 to-blue-700 text-white p-4 rounded-lg shadow-lg hover:shadow-indigo-200 transition flex flex-col items-center justify-center gap-2"
            >
              <span className="text-2xl">🤖</span>
              <span className="font-bold">AIインタビュアーを開始</span>
              <span className="text-xs text-indigo-100">AIが主導してインタビュー</span>
            </button>

            <button
              onClick={() => {
                setShowCreateModal(true);
                (window as any).__redirectType = 'editor';
              }}
              className="flex-1 bg-blue-600 text-white p-4 rounded-lg shadow-lg hover:bg-blue-700 transition flex flex-col items-center justify-center gap-2"
            >
              <span className="text-2xl">🎙️</span>
              <span className="font-bold">新規セッション作成</span>
              <span className="text-xs text-blue-100">リアルタイム文字起こし</span>
            </button>
          </div>
        </div>

        {/* セッション一覧 */}
        {sessions.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-lg border border-gray-200">
            <p className="text-gray-500 text-lg">まだセッションがありません</p>
            <p className="text-gray-400 text-sm mt-2">「新規セッション作成」から始めましょう</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {sessions.map((session) => (
              <div
                key={session.session_id}
                onClick={() => router.push(`/editor/${session.session_id}`)}
                className="bg-white p-6 rounded-lg border border-gray-200 hover:border-blue-400 hover:shadow-md transition cursor-pointer"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900">{session.title}</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      作成: {new Date(session.created_at).toLocaleString('ja-JP')}
                    </p>
                    <div className="flex gap-4 mt-3 text-sm text-gray-600">
                      <span>📝 発話: {session.transcript.length}件</span>
                      <span>📌 メモ: {session.notes.length}件</span>
                      <span>📄 原稿: {session.article_draft.text.length}文字</span>
                    </div>
                  </div>
                  <div>{getStatusBadge(session.status)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* 新規作成モーダル */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-semibold mb-4">新規セッション作成</h2>
            <input
              type="text"
              value={newSessionTitle}
              onChange={(e) => setNewSessionTitle(e.target.value)}
              placeholder="セッションのタイトルを入力..."
              className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  createSession();
                }
              }}
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewSessionTitle('');
                }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded transition"
              >
                キャンセル
              </button>
              <button
                onClick={createSession}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition"
              >
                作成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

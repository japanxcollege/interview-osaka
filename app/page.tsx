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
      preparing: { text: '準備中', color: 'bg-gray-100 text-gray-600 border-gray-200' },
      recording: { text: '録音中', color: 'bg-rose-100 text-rose-600 border-rose-200 animate-pulse' },
      editing: { text: '編集中', color: 'bg-indigo-100 text-indigo-600 border-indigo-200' },
      completed: { text: '完了', color: 'bg-emerald-100 text-emerald-600 border-emerald-200' },
    };
    const badge = badges[status as keyof typeof badges] || badges.preparing;
    return (
      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${badge.color}`}>
        {badge.text}
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-neutral-50">
        <div className="flex flex-col items-center">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans selection:bg-blue-100 selection:text-blue-900">
      {/* Background Decor */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-[20%] -right-[10%] w-[50%] h-[50%] bg-blue-100/40 rounded-full blur-3xl opacity-50"></div>
        <div className="absolute top-[20%] -left-[10%] w-[40%] h-[40%] bg-indigo-100/40 rounded-full blur-3xl opacity-50"></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Header */}
        <header className="mb-10 sm:mb-16 flex flex-col sm:flex-row justify-between items-start sm:items-end border-b border-gray-200/50 pb-6 gap-4 sm:gap-0">
          <div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-gray-900">
              Interview <span className="text-blue-600">Editor</span>
            </h1>
            <p className="text-gray-500 mt-2 text-base sm:text-lg font-light">
              AI-driven Real-time Interview Assistant & Editor
            </p>
          </div>
          <button
            onClick={() => router.push('/admin/prompts')}
            className="p-3 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors duration-200 self-end sm:self-auto"
            title="管理者設定"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </header>

        {/* Action Cards */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-12 sm:mb-16">
          <button
            onClick={() => router.push('/writer/upload')}
            className="group relative overflow-hidden bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 text-left"
          >
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-32 w-32 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="relative z-10 w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
              <span className="text-2xl">📂</span>
            </div>
            <h3 className="text-lg font-bold text-gray-900 group-hover:text-orange-600 transition-colors">Import Audio</h3>
            <p className="text-sm text-gray-500 mt-1">音声ファイルから文字起こし・記事作成</p>
          </button>

          <button
            onClick={() => {
              setShowCreateModal(true);
              (window as any).__redirectType = 'interviewer';
            }}
            // Adjusted classNameOrder for better readability/consistency
            className="group relative overflow-hidden bg-gradient-to-br from-indigo-600 to-blue-700 p-6 rounded-2xl shadow-lg hover:shadow-indigo-500/30 hover:-translate-y-1 transition-all duration-300 text-left sm:col-span-2 lg:col-span-1"
          >
            <div className="absolute -bottom-10 -right-10 opacity-20 transform rotate-12">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-40 w-40 text-white" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2 10a8 8 0 018-8v8h8a8 8 0 11-16 0z" />
                <path d="M12 2.252A8.014 8.014 0 0117.748 8H12V2.252z" />
              </svg>
            </div>
            <div className="relative z-10 w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
              <span className="text-2xl">🤖</span>
            </div>
            <h3 className="text-lg font-bold text-white">AI Interviewer</h3>
            <p className="text-indigo-100 text-sm mt-1">AIがインタビュアーとなり対話をリード</p>
          </button>

          <button
            onClick={() => {
              setShowCreateModal(true);
              (window as any).__redirectType = 'editor';
            }}
            className="group relative overflow-hidden bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 text-left sm:col-span-2 lg:col-span-1"
          >
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-32 w-32 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="relative z-10 w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
              <span className="text-2xl">🎙️</span>
            </div>
            <h3 className="text-lg font-bold text-gray-900 group-hover:text-blue-600 transition-colors">Start Session</h3>
            <p className="text-sm text-gray-500 mt-1">リアルタイム文字起こしと手動記録</p>
          </button>
        </section>

        {/* Session List */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <h2 className="text-xl font-bold text-gray-800">Recent Sessions</h2>
            <div className="h-px flex-1 bg-gray-200"></div>
          </div>

          {sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 bg-white/50 backdrop-blur-sm rounded-3xl border border-gray-200 border-dashed">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4 text-gray-400">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <p className="text-gray-500 font-medium">No sessions found</p>
              <p className="text-gray-400 text-sm mt-1">Get started by creating a new session above.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {sessions.map((session) => (
                <div
                  key={session.session_id}
                  onClick={() => router.push(`/editor/${session.session_id}`)}
                  className="group bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-blue-50 to-transparent rounded-bl-full -mr-4 -mt-4 opacity-50 transition-opacity group-hover:opacity-100"></div>

                  <div className="flex justify-between items-start mb-4 relative z-10">
                    <div className="bg-gray-50 text-gray-400 px-2 py-1 rounded text-xs font-mono">
                      {new Date(session.created_at).toLocaleDateString('ja-JP')}
                    </div>
                    {getStatusBadge(session.status)}
                  </div>

                  <h3 className="text-lg font-bold text-gray-900 mb-2 line-clamp-2 group-hover:text-blue-600 transition-colors">
                    {session.title}
                  </h3>

                  <div className="flex gap-4 mt-6 pt-4 border-t border-gray-50 text-xs font-medium text-gray-500">
                    <div className="flex items-center gap-1">
                      <span className="text-gray-400">💬</span>
                      <span>{session.transcript.length} utts</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-gray-400">📝</span>
                      <span>{session.article_draft.text.length} chars</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md transform transition-all animate-in fade-in zoom-in duration-200">
            <h2 className="text-2xl font-bold text-gray-900 mb-1">New Session</h2>
            <p className="text-gray-500 text-sm mb-6">Enter a title to begin your interview session.</p>

            <input
              type="text"
              value={newSessionTitle}
              onChange={(e) => setNewSessionTitle(e.target.value)}
              placeholder="e.g. Interview with Mr. Tanaka"
              className="w-full px-5 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-gray-900 placeholder-gray-400 mb-6"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') createSession();
              }}
            />

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewSessionTitle('');
                }}
                className="px-5 py-2.5 text-gray-600 hover:bg-gray-100 rounded-xl transition font-medium"
              >
                Cancel
              </button>
              <button
                onClick={createSession}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 shadow-md hover:shadow-lg transition font-medium"
              >
                Create Session
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

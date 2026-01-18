'use client';

import React from 'react';


export interface AIStatus {
  target: 'article' | 'question' | 'summary' | 'general';
  status: 'idle' | 'processing' | 'completed' | 'error';
  message: string;
  progress?: number; // 0-100
}

interface AISuggestionsPanelProps {
  suggestedQuestions: string[];
  frontSummary?: string;
  autoSummary?: string;
  pendingArticleCount?: number;
  pendingQuestionCount?: number;
  aiStatus?: {
    article: AIStatus;
    question: AIStatus;
    general?: AIStatus; // General AI status (e.g. chat)
  };
}

/**
 * AI提案パネル (Phase 1)
 * - AI生成の質問提案
 * - 3分ごとの要約 (front_summary)
 * - 最終要約 (auto_summary)
 * - 原稿自動生成の処理状況表示（逐次処理）
 */
export default function AISuggestionsPanel({
  suggestedQuestions,
  frontSummary,
  autoSummary,
  pendingArticleCount = 0,
  pendingQuestionCount = 0,
  aiStatus = {
    article: { target: 'article', status: 'idle', message: '' },
    question: { target: 'question', status: 'idle', message: '' },
  },
}: AISuggestionsPanelProps) {
  const isArticleProcessing = aiStatus.article.status === 'processing';
  const isQuestionProcessing = aiStatus.question.status === 'processing';

  // Calculate generic progress if not provided by status
  const articleProgress = aiStatus.article.progress ?? Math.min((pendingArticleCount / 10) * 100, 100);
  const questionProgress = aiStatus.question.progress ?? (pendingQuestionCount / 5) * 100;

  return (
    <div className="h-full flex flex-col bg-white border-l border-gray-200">
      {/* ヘッダー */}
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
          AI提案
          {(isArticleProcessing || isQuestionProcessing) && (
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
            </span>
          )}
        </h2>
        <p className="text-xs text-gray-500 mt-1">
          Gemini APIによる質問提案・要約・原稿生成
        </p>
      </div>

      {/* コンテンツ */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* AI原稿生成状況 */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center justify-between">
            <span className="flex items-center"><span className="mr-2">📝</span> 原稿自動生成</span>
            {isArticleProcessing && <span className="text-[10px] text-purple-600 animate-pulse font-bold">生成中...</span>}
          </h3>
          <div className={`p-3 rounded-lg border transition-all duration-300 ${aiStatus.article.status === 'error' ? 'bg-red-50 border-red-200' :
            isArticleProcessing ? 'bg-purple-50 border-purple-200 shadow-sm ring-1 ring-purple-100' : 'bg-gray-50 border-gray-200'
            }`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-600">蓄積された文字起こし</span>
              <span className={`text-lg font-bold ${pendingArticleCount >= 10 ? 'text-purple-600' : 'text-gray-800'}`}>
                {pendingArticleCount} / 10件
              </span>
            </div>
            <div className="space-y-2">
              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-2 rounded-full transition-all duration-700 ease-out ${isArticleProcessing ? 'bg-gradient-to-r from-purple-400 to-purple-600 animate-pulse' : 'bg-purple-300'
                    }`}
                  style={{ width: `${articleProgress}%` }}
                />
              </div>

              <div className="flex items-center gap-2 min-h-[1.5em]">
                {isArticleProcessing && (
                  <div className="w-3 h-3 border-2 border-purple-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                )}
                <p className={`text-xs font-medium truncate ${aiStatus.article.status === 'error' ? 'text-red-600' :
                  isArticleProcessing ? 'text-purple-700' : 'text-gray-600'
                  }`}>
                  {aiStatus.article.message || (
                    pendingArticleCount >= 10
                      ? '✅ 処理待ち...'
                      : `あと ${10 - pendingArticleCount} 件で自動生成`
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 質問提案セクション */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center justify-between">
            <span className="flex items-center"><span className="mr-2">💡</span> 質問提案</span>
            {isQuestionProcessing && <span className="text-[10px] text-blue-600 animate-pulse font-bold">考え中...</span>}
          </h3>
          {/* 質問生成状況 */}
          <div className={`mb-3 p-3 rounded-lg border transition-all duration-300 ${aiStatus.question.status === 'error' ? 'bg-red-50 border-red-200' :
            isQuestionProcessing ? 'bg-blue-50 border-blue-200 shadow-sm ring-1 ring-blue-100' : 'bg-blue-50/30 border-blue-100'
            }`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-600">次の提案まで</span>
              <span className={`text-sm font-bold ${pendingQuestionCount >= 5 ? 'text-blue-600' : 'text-gray-800'}`}>
                {pendingQuestionCount} / 5件
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden mb-2">
              <div
                className={`h-1.5 rounded-full transition-all duration-700 ease-out ${isQuestionProcessing ? 'bg-gradient-to-r from-blue-400 to-blue-600 animate-pulse' : 'bg-blue-300'
                  }`}
                style={{ width: `${questionProgress}%` }}
              />
            </div>
            <div className="flex items-center gap-2 min-h-[1.5em]">
              {isQuestionProcessing && (
                <div className="w-2.5 h-2.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              )}
              <p className={`text-xs font-medium truncate ${aiStatus.question.status === 'error' ? 'text-red-600' :
                isQuestionProcessing ? 'text-blue-700' : 'text-gray-600'
                }`}>
                {aiStatus.question.message || (
                  pendingQuestionCount >= 5
                    ? '✅ 待機中...'
                    : `発話蓄積中...`
                )}
              </p>
            </div>
          </div>

          {suggestedQuestions.length === 0 ? (
            <p className="text-xs text-gray-400 italic px-1">
              まだ提案はありません
            </p>
          ) : (
            <ul className="space-y-2">
              {suggestedQuestions.map((question, idx) => (
                <li
                  key={idx}
                  className="p-3 bg-blue-50 rounded-lg border border-blue-100 shadow-sm hover:shadow-md transition-shadow"
                >
                  <p className="text-sm text-gray-800">{question}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 3分要約セクション */}
        {frontSummary && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center">
              <span className="mr-2">📊</span>
              3分要約
            </h3>
            <div className="p-3 bg-green-50 rounded-lg border border-green-100">
              <p className="text-sm text-gray-800 whitespace-pre-wrap">
                {frontSummary}
              </p>
            </div>
          </div>
        )}

        {/* 最終要約セクション */}
        {autoSummary && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center">
              <span className="mr-2">📝</span>
              最終要約
            </h3>
            <div className="p-3 bg-purple-50 rounded-lg border border-purple-100">
              <p className="text-sm text-gray-800 whitespace-pre-wrap">
                {autoSummary}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

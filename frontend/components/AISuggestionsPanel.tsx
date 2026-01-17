'use client';

import React from 'react';

export interface AIStatus {
  target: 'article' | 'question' | 'summary';
  status: 'idle' | 'processing' | 'completed' | 'error';
  message: string;
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
  const isArticleProcessing = aiStatus.article.status === 'processing' || pendingArticleCount >= 10;
  const isQuestionProcessing = aiStatus.question.status === 'processing' || pendingQuestionCount >= 5;

  return (
    <div className="h-full flex flex-col bg-white border-l border-gray-200">
      {/* ヘッダー */}
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-bold text-gray-800">AI提案</h2>
        <p className="text-xs text-gray-500 mt-1">
          Gemini APIによる質問提案・要約・原稿生成
        </p>
      </div>

      {/* コンテンツ */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* AI原稿生成状況 */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center">
            <span className="mr-2">📝</span>
            原稿自動生成
          </h3>
          <div className={`p-3 rounded-lg border transition-colors ${aiStatus.article.status === 'error' ? 'bg-red-50 border-red-200' :
              isArticleProcessing ? 'bg-purple-50 border-purple-200' : 'bg-gray-50 border-gray-200'
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
                  className={`h-2 rounded-full transition-all duration-500 ${isArticleProcessing ? 'bg-purple-500 animate-pulse' : 'bg-purple-300'
                    }`}
                  style={{ width: `${Math.min((pendingArticleCount / 10) * 100, 100)}%` }}
                />
              </div>

              <div className="flex items-center gap-2">
                {isArticleProcessing && (
                  <div className="w-3 h-3 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                )}
                <p className={`text-xs font-medium ${aiStatus.article.status === 'error' ? 'text-red-600' :
                    isArticleProcessing ? 'text-purple-700' : 'text-gray-600'
                  }`}>
                  {aiStatus.article.message || (
                    pendingArticleCount >= 10
                      ? '✅ 10件到達 - 準備中...'
                      : `あと ${10 - pendingArticleCount} 件で自動生成されます`
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 質問提案セクション */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center">
            <span className="mr-2">💡</span>
            質問提案
          </h3>
          {/* 質問生成状況 */}
          <div className={`mb-3 p-3 rounded-lg border transition-colors ${aiStatus.question.status === 'error' ? 'bg-red-50 border-red-200' :
              isQuestionProcessing ? 'bg-blue-50 border-blue-200' : 'bg-blue-50/30 border-blue-100'
            }`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-600">次の提案まで</span>
              <span className={`text-sm font-bold ${pendingQuestionCount >= 5 ? 'text-blue-600' : 'text-gray-800'}`}>
                {pendingQuestionCount} / 5件
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden mb-2">
              <div
                className={`h-1.5 rounded-full transition-all duration-500 ${isQuestionProcessing ? 'bg-blue-500 animate-pulse' : 'bg-blue-300'
                  }`}
                style={{ width: `${(pendingQuestionCount / 5) * 100}%` }}
              />
            </div>
            <div className="flex items-center gap-2">
              {isQuestionProcessing && (
                <div className="w-2.5 h-2.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              )}
              <p className={`text-xs font-medium ${aiStatus.question.status === 'error' ? 'text-red-600' :
                  isQuestionProcessing ? 'text-blue-700' : 'text-gray-600'
                }`}>
                {aiStatus.question.message || (
                  pendingQuestionCount >= 5
                    ? '✅ 待機中...'
                    : `発話が5件蓄積されるとAIが質問を提案します`
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

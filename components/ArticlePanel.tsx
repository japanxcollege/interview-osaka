
/**
 * 原稿パネル（左）
 * Markdown形式の記事を編集・プレビュー
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';

import { ArticleDraft } from '@/types';

interface ArticlePanelProps {
  text: string;
  lastUpdated: string;
  onChange: (text: string) => void;
  wsClient?: any;
  onAIProcessingStart?: () => void;
  onAIProcessingEnd?: () => void;
  drafts?: ArticleDraft[];
  activeDraftId?: string;
  onSwitchDraft?: (draftId: string) => void;
  onGenerateDraft?: (styleId: string) => void;
  availableStyles?: any[]; // {id, name, description}

  // History Logic
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onSaveVersion?: () => void;

  // External Action (e.g. from Chat Apply)
  externalAction?: { type: 'insert', text: string } | null;
  onActionComplete?: () => void;
}

export default function ArticlePanel({
  text,
  lastUpdated,
  onChange,
  wsClient,
  onAIProcessingStart,
  onAIProcessingEnd,
  drafts = [],
  activeDraftId,
  onSwitchDraft,
  onGenerateDraft,
  availableStyles = [],
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onSaveVersion,
  externalAction,
  onActionComplete
}: ArticlePanelProps) {
  const [localText, setLocalText] = useState(text);
  const [isDirty, setIsDirty] = useState(false);
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');

  const [showMenu, setShowMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [showStyleMenu, setShowStyleMenu] = useState(false); // New Draft Menu
  const [selectedRange, setSelectedRange] = useState<{ start: number; end: number } | null>(null);
  const [showCustomPrompt, setShowCustomPrompt] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState('');
  const [isMenuHovered, setIsMenuHovered] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocalText(text);
    setIsDirty(false);
    // AI処理完了時にローディングを解除
    if (isProcessing) {
      setIsProcessing(false);
      setProcessingMessage('');
    }
  }, [text]);

  // Handle External Insertion
  useEffect(() => {
    if (externalAction && textareaRef.current) {
      if (externalAction.type === 'insert') {
        const textarea = textareaRef.current;
        const start = textarea.selectionStart || 0;
        const end = textarea.selectionEnd || 0;
        const currentVal = textarea.value;
        const insertText = externalAction.text;

        const newVal = currentVal.substring(0, start) + insertText + currentVal.substring(end);

        setLocalText(newVal);
        onChange(newVal);

        // Notify parent
        onActionComplete?.();
      }
    }
  }, [externalAction]);

  // メニュー外クリックでメニューを閉じる（textarea外のみ）
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // メニュー内クリックは無視（ボタンクリックも含む）
      if (target.closest('.ai-menu')) return;
      // textarea内クリックは無視（選択を維持）
      if (target === textareaRef.current) return;
      // textareaの親要素内のクリックも無視
      if (target.closest('.article-editor-area')) return;

      // それ以外（完全な外側）はメニューを閉じる
      setShowMenu(false);
      setSelectedRange(null);
      setIsMenuHovered(false);
    };

    if (showMenu) {
      // mousedownとclickの両方で処理（mousedownは即座に、clickは確実に）
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('click', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('click', handleClickOutside);
      };
    }
  }, [showMenu]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setLocalText(newText);
    setIsDirty(true);

    // デバウンス処理（500ms）
    const timer = setTimeout(() => {
      onChange(newText);
      setIsDirty(false);
    }, 500);

    return () => clearTimeout(timer);
  };

  const handleTextSelect = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // 少し遅延させて、選択が確定してから処理
    setTimeout(() => {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      if (start !== end) {
        // テキストが選択されている
        setSelectedRange({ start, end });

        // メニューの位置を計算（ビューポート内に収まるように調整）
        const textareaRect = textarea.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // メニューの最大幅を想定（実際の幅は後で取得）
        // ボタンが6つあるため、幅は最大650px程度を想定（安全マージン込み）
        const estimatedMenuWidth = 650;
        const estimatedMenuHeight = 60;

        // 基本位置：テキストエリアの中央上部
        let x = textareaRect.left + (textareaRect.width / 2);
        let y = textareaRect.top + 20;

        // マージン（安全のため少し大きめに）
        const margin = 15;

        // translateX(-50%)を使っているため、leftはメニューの中央位置
        // 左端 = x - width/2, 右端 = x + width/2

        // まず左端が切れないようにチェック（優先度高）
        const leftEdge = x - (estimatedMenuWidth / 2);
        if (leftEdge < margin) {
          x = (estimatedMenuWidth / 2) + margin;
        }

        // 次に右端が切れないようにチェック
        const rightEdge = x + (estimatedMenuWidth / 2);
        if (rightEdge > viewportWidth - margin) {
          x = viewportWidth - (estimatedMenuWidth / 2) - margin;

          // 右端を調整した結果、左端が切れる場合は左端を優先
          const newLeftEdge = x - (estimatedMenuWidth / 2);
          if (newLeftEdge < margin) {
            // メニューがビューポートより大きい場合は、左端に寄せる
            x = (estimatedMenuWidth / 2) + margin;
          }
        }

        // ビューポートの下端を超えないように調整（メニューを上に配置）
        if (y + estimatedMenuHeight > viewportHeight - margin) {
          y = viewportHeight - estimatedMenuHeight - margin;
        }
        // ビューポートの上端を超えないように調整
        if (y < margin) {
          y = margin;
        }

        setMenuPosition({ x, y });
        setShowMenu(true);

        // メニューが表示された後に、実際の幅を取得して位置を再調整
        // requestAnimationFrameを使って確実にDOMが描画された後に実行
        requestAnimationFrame(() => {
          setTimeout(() => {
            if (menuRef.current) {
              const menuRect = menuRef.current.getBoundingClientRect();
              const actualMenuWidth = menuRect.width;
              const actualMenuHeight = menuRect.height;

              // 現在のビューポートサイズを再取得
              const currentViewportWidth = window.innerWidth;
              const currentViewportHeight = window.innerHeight;

              // メニューの実際の幅に基づいて位置を再計算
              // translateX(-50%)を使っているため、leftはメニューの中央位置
              let adjustedX = x;
              let adjustedY = y;

              const margin = 10;

              // メニューの左端位置（left - width/2）
              const menuLeftEdge = adjustedX - (actualMenuWidth / 2);
              // メニューの右端位置（left + width/2）
              const menuRightEdge = adjustedX + (actualMenuWidth / 2);

              // 左端が切れないように調整
              if (menuLeftEdge < margin) {
                adjustedX = (actualMenuWidth / 2) + margin;
              }

              // 右端が切れないように調整
              if (menuRightEdge > currentViewportWidth - margin) {
                adjustedX = currentViewportWidth - (actualMenuWidth / 2) - margin;
              }

              // 下端が切れないように調整
              if (adjustedY + actualMenuHeight > currentViewportHeight - margin) {
                adjustedY = currentViewportHeight - actualMenuHeight - margin;
              }

              // 上端が切れないように調整
              if (adjustedY < margin) {
                adjustedY = margin;
              }

              // 位置が変更された場合のみ更新
              if (Math.abs(adjustedX - x) > 1 || Math.abs(adjustedY - y) > 1) {
                setMenuPosition({ x: adjustedX, y: adjustedY });
              }
            }
          }, 0);
        });
      }
    }, 10);
  };

  const getSelectedText = () => {
    if (!selectedRange) return '';
    return localText.substring(selectedRange.start, selectedRange.end);
  };

  const handleAIAction = async (action: string, instruction?: string) => {
    console.log('🎯 handleAIAction called:', { action, instruction, selectedRange, wsClient });

    if (!selectedRange) {
      console.error('❌ selectedRange is null');
      return;
    }

    if (!wsClient) {
      console.error('❌ wsClient is null');
      alert('WebSocket接続がありません。ページをリロードしてください。');
      return;
    }

    // カスタム指示の場合、指示が空でないことを確認
    if (action === 'custom') {
      if (!instruction || !instruction.trim()) {
        alert('カスタム指示を入力してください');
        return;
      }
    }

    // 親コンポーネントに処理開始を通知
    if (onAIProcessingStart) {
      console.log('🔄 Starting AI processing...');
      onAIProcessingStart();
    }

    setShowMenu(false);

    const selectedText = getSelectedText();
    const messageType =
      action === 'improve' || action === 'rewrite' || action === 'custom' ? 'improve_text' :
        action === 'subsection' ? 'restructure_subsection' :
          'restructure_section';

    // 指示テキストの決定（カスタム指示を優先）
    let instructionText = '';
    if (action === 'improve') {
      instructionText = 'この文章をより良く、読みやすくブラッシュアップしてください。';
    } else if (action === 'rewrite') {
      instructionText = 'この文章を同じ内容で、異なる表現で書き直してください。';
    } else if (action === 'custom' && instruction) {
      instructionText = instruction.trim();
    } else if (instruction) {
      instructionText = instruction.trim();
    }

    console.log('📤 Sending WebSocket message:', {
      type: messageType,
      action,
      instruction: instructionText.substring(0, 50) + (instructionText.length > 50 ? '...' : ''),
      selectedText: selectedText.substring(0, 50) + '...',
      start: selectedRange.start,
      end: selectedRange.end
    });

    try {
      // 選択テキストが空の場合はエラー
      if (!selectedText.trim()) {
        alert('テキストを選択してください');
        if (onAIProcessingEnd) {
          onAIProcessingEnd();
        }
        return;
      }

      // WebSocket接続状態を確認
      if (!wsClient.isConnected()) {
        alert('WebSocket接続が切れています。ページをリロードしてください。');
        if (onAIProcessingEnd) {
          onAIProcessingEnd();
        }
        return;
      }

      // WebSocket経由でAI処理をリクエスト
      // NOTE: This will trigger 'text_improved' in parent EditorPage.
      // EditorPage will then add it to Chat.
      wsClient.send(messageType, {
        selected_text: selectedText,
        instruction: instructionText,
        context: '', // 必要に応じて前後の文脈を追加
        start_pos: selectedRange.start,
        end_pos: selectedRange.end
      });

      console.log('✅ WebSocket message sent successfully');

      // レスポンスを待つ（text_improvedメッセージで受信）
      // 実際のレスポンス処理は親コンポーネントで行う
      // エラー時やタイムアウト時は親コンポーネントのerrorハンドラで処理される
    } catch (error) {
      console.error('❌ AI処理エラー:', error);
      if (onAIProcessingEnd) {
        onAIProcessingEnd();
      }
      alert(`AI処理に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
    }
  };

  return (
    <div className="flex flex-col h-full border-r border-gray-300 relative">
      {/* テキスト選択メニュー */}
      {showMenu && (
        <div
          ref={menuRef}
          className="ai-menu fixed z-50 bg-white border-2 border-blue-400 rounded-lg shadow-2xl p-2 flex gap-2 items-center flex-wrap"
          style={{
            left: `${menuPosition.x}px`,
            top: `${menuPosition.y}px`,
            transform: 'translateX(-50%)',
            pointerEvents: 'auto',
            maxWidth: 'calc(100vw - 30px)', // ビューポート幅に収まるように（マージン込み）
            maxHeight: 'calc(100vh - 30px)' // ビューポート高さに収まるように（マージン込み）
          }}
          onMouseEnter={() => setIsMenuHovered(true)}
          onMouseLeave={() => setIsMenuHovered(false)}
        >
          {/* 閉じるボタン */}
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowMenu(false);
              setSelectedRange(null);
              setIsMenuHovered(false);
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            className="px-2 py-1.5 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition cursor-pointer"
            title="閉じる"
          >
            ✕
          </button>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleAIAction('improve');
            }}
            className="px-3 py-1.5 text-sm bg-blue-50 hover:bg-blue-100 rounded transition cursor-pointer font-medium"
          >
            ✨ ブラッシュアップ
          </button>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleAIAction('rewrite');
            }}
            className="px-3 py-1.5 text-sm bg-green-50 hover:bg-green-100 rounded transition cursor-pointer font-medium"
          >
            🔄 書き直し
          </button>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleAIAction('subsection');
            }}
            className="px-3 py-1.5 text-sm bg-purple-50 hover:bg-purple-100 rounded transition cursor-pointer font-medium"
          >
            📦 小見出しセクション化
          </button>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleAIAction('section');
            }}
            className="px-3 py-1.5 text-sm bg-orange-50 hover:bg-orange-100 rounded transition cursor-pointer font-medium"
          >
            📦 大見出しセクション化
          </button>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowCustomPrompt(true);
            }}
            className="px-3 py-1.5 text-sm bg-gray-50 hover:bg-gray-100 rounded transition cursor-pointer font-medium"
          >
            💬 カスタム指示
          </button>
        </div>
      )}

      {/* カスタムプロンプト入力ダイアログ */}
      {showCustomPrompt && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={(e) => {
            // 背景クリックで閉じる
            if (e.target === e.currentTarget) {
              setShowCustomPrompt(false);
              setCustomPrompt('');
            }
          }}
        >
          <div
            className="bg-white rounded-lg p-6 w-full max-w-md max-h-[calc(100vh-40px)] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-4">カスタム指示を入力</h3>
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              className="w-full border border-gray-300 rounded p-2 mb-4 resize-none"
              rows={4}
              placeholder="例: もっと簡潔にしてください"
              autoFocus
              onKeyDown={(e) => {
                // Ctrl+Enter または Cmd+Enter で実行
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  if (customPrompt.trim()) {
                    handleAIAction('custom', customPrompt);
                    setShowCustomPrompt(false);
                    setCustomPrompt('');
                  }
                }
                // Escape でキャンセル
                if (e.key === 'Escape') {
                  setShowCustomPrompt(false);
                  setCustomPrompt('');
                }
              }}
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowCustomPrompt(false);
                  setCustomPrompt('');
                }}
                className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 transition"
              >
                キャンセル
              </button>
              <button
                onClick={() => {
                  if (!customPrompt.trim()) {
                    alert('カスタム指示を入力してください');
                    return;
                  }
                  handleAIAction('custom', customPrompt);
                  setShowCustomPrompt(false);
                  setCustomPrompt('');
                }}
                disabled={!customPrompt.trim()}
                className={`px-4 py-2 rounded transition ${customPrompt.trim()
                  ? 'bg-blue-500 text-white hover:bg-blue-600'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
              >
                実行
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              💡 ヒント: Ctrl+Enter (Mac: Cmd+Enter) で実行、Esc でキャンセル
            </p>
          </div>
        </div>
      )}

      {/* ドラフト切り替えタブ */}
      {drafts.length > 0 && (
        <div className="flex bg-gray-100 border-b border-gray-300">
          <div className="flex-1 overflow-x-auto flex">
            {drafts.map(d => (
              <button
                key={d.draft_id}
                onClick={() => onSwitchDraft?.(d.draft_id)}
                className={`px-4 py-2 text-xs font-medium border-r border-gray-300 whitespace-nowrap ${(d.draft_id === activeDraftId || (!activeDraftId && drafts.indexOf(d) === 0))
                  ? 'bg-white text-blue-600 border-b-2 border-b-blue-500'
                  : 'text-gray-600 hover:bg-gray-200'
                  }`}
              >
                {d.name || 'Draft'}
              </button>
            ))}
          </div>
          <div className="relative flex-shrink-0 border-l border-gray-300 z-10">
            <button
              onClick={() => setShowStyleMenu(!showStyleMenu)}
              className="px-3 py-2 h-full text-xs font-bold text-gray-500 hover:text-blue-600 hover:bg-gray-200"
              title="新しいプロンプトで生成"
            >
              +
            </button>
            {showStyleMenu && (
              <div className="absolute top-full right-0 z-50 bg-white border border-gray-300 shadow-lg rounded-md w-64 mt-1">
                <div className="p-2 text-xs font-bold text-gray-500 border-b">比較用の原稿を生成</div>
                {availableStyles.map(s => (
                  <button
                    key={s.id}
                    onClick={() => {
                      if (confirm(`"${s.name}" スタイルで新しい原稿を生成しますか？\n（現在の原稿は保存されます）`)) {
                        onGenerateDraft?.(s.id);
                        setShowStyleMenu(false);
                      }
                    }}
                    className="w-full text-left px-4 py-2 text-sm hover:bg-blue-50 text-gray-800"
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ヘッダー */}
      <div className="p-4 border-b border-gray-300 bg-gray-50">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-gray-800">📝 原稿</h2>
            <div className="flex items-center border-l border-gray-300 pl-3 ml-2 gap-1">
              <button
                onClick={onUndo}
                disabled={!canUndo}
                className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-200 disabled:opacity-30 disabled:hover:bg-transparent rounded transition"
                title="元に戻す (Cmd+Z)"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
              </button>
              <button
                onClick={onRedo}
                disabled={!canRedo}
                className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-200 disabled:opacity-30 disabled:hover:bg-transparent rounded transition"
                title="やり直す (Cmd+Shift+Z)"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" /></svg>
              </button>
              {onSaveVersion && (
                <button
                  onClick={() => onSaveVersion()}
                  className="ml-2 px-2 py-1 text-xs bg-white border border-gray-300 text-gray-600 hover:bg-gray-100 rounded transition flex items-center gap-1 shadow-sm"
                  title="バージョンを保存"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                  Save
                </button>
              )}
            </div>
          </div>

          {/* モード切替ボタン */}
          <div className="flex gap-1 bg-white border border-gray-300 rounded-md overflow-hidden">
            <button
              onClick={() => setViewMode('edit')}
              className={`px-3 py-1 text-sm font-medium transition ${viewMode === 'edit'
                ? 'bg-blue-500 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
            >
              ✏️ 編集
            </button>
            <button
              onClick={() => setViewMode('preview')}
              className={`px-3 py-1 text-sm font-medium transition ${viewMode === 'preview'
                ? 'bg-blue-500 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
            >
              👁️ プレビュー
            </button>
          </div>
        </div>

        <p className="text-xs text-gray-500">
          最終更新: {new Date(lastUpdated).toLocaleString('ja-JP')}
          {isDirty && ' (編集中...)'}
        </p>
      </div>

      {/* コンテンツエリア */}
      <div className="flex-1 overflow-hidden article-editor-area">
        {viewMode === 'edit' ? (
          /* エディタモード */
          <textarea
            ref={textareaRef}
            value={localText}
            onChange={handleChange}
            onMouseUp={handleTextSelect}
            onKeyUp={handleTextSelect}
            className="w-full h-full p-4 font-mono text-sm resize-none focus:outline-none"
            placeholder="# タイトル&#10;&#10;## はじめに&#10;&#10;本文を入力してください...&#10;&#10;### 見出し3&#10;&#10;- リスト項目1&#10;- リスト項目2&#10;&#10;**太字** *イタリック*"
          />
        ) : (
          /* プレビューモード */
          <div className="h-full overflow-y-auto p-6 prose prose-sm max-w-none">
            <ReactMarkdown
              components={{
                h1: ({ node, ...props }) => <h1 className="text-3xl font-bold mb-4 mt-6 text-gray-900" {...props} />,
                h2: ({ node, ...props }) => <h2 className="text-2xl font-bold mb-3 mt-5 text-gray-800" {...props} />,
                h3: ({ node, ...props }) => <h3 className="text-xl font-semibold mb-2 mt-4 text-gray-800" {...props} />,
                h4: ({ node, ...props }) => <h4 className="text-lg font-semibold mb-2 mt-3 text-gray-700" {...props} />,
                p: ({ node, ...props }) => <p className="mb-3 leading-relaxed text-gray-700" {...props} />,
                ul: ({ node, ...props }) => <ul className="list-disc list-inside mb-3 space-y-1" {...props} />,
                ol: ({ node, ...props }) => <ol className="list-decimal list-inside mb-3 space-y-1" {...props} />,
                li: ({ node, ...props }) => <li className="text-gray-700" {...props} />,
                strong: ({ node, ...props }) => <strong className="font-bold text-gray-900" {...props} />,
                em: ({ node, ...props }) => <em className="italic text-gray-800" {...props} />,
                blockquote: ({ node, ...props }) => (
                  <blockquote className="border-l-4 border-blue-500 pl-4 italic my-3 text-gray-600" {...props} />
                ),
                code: ({ node, ...props }) => (
                  <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono text-red-600" {...props} />
                ),
              }}
            >
              {localText || '*原稿がまだありません。編集モードで記事を書き始めましょう。*'}
            </ReactMarkdown>
          </div>
        )}
      </div>

      {/* フッター */}
      <div className="p-2 border-t border-gray-300 bg-gray-50 text-xs text-gray-600 flex justify-between items-center">
        <span>文字数: {localText.length}</span>
        {viewMode === 'preview' && (
          <span className="text-blue-600">💡 編集するには「✏️ 編集」ボタンをクリック</span>
        )}
      </div>
    </div>
  );
}

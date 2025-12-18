# 変更履歴: AI機能の可視化と改善

**日付**: 2025-11-12  
**概要**: AI提案と原稿自動生成機能の処理状況を可視化（逐次処理・自動実行）

---

## 問題点

ユーザーから「AI提案の話と、原稿の話をやって　しっかり反映できていない」という指摘がありました。

**根本原因**:
- ✅ バックエンドの実装は完了していた
- ❌ フロントエンドでAI処理状況が見えなかった
- ❌ 自動生成がいつ実行されるか不明瞭
- ❌ どれくらい処理が進んでいるか分からなかった

---

## 実装した改善

### 1. フロントエンド改善

#### 📊 AISuggestionsPanelの拡張

**ファイル**: `frontend/components/AISuggestionsPanel.tsx`

**追加した表示**:
- 原稿自動生成の進捗状況
  - プログレスバー（X / 10件）
  - リアルタイム更新
  - 閾値到達時の処理中表示
- 質問提案の進捗状況
  - プログレスバー（X / 5件）
  - 提案履歴の表示
- 逐次処理の可視化
  - 自動実行のみ（手動トリガーなし）
  - 処理状況の明確な表示

**ビジュアル例（処理待ち）**:
```
┌─────────────────────────────────┐
│ 📝 原稿自動生成                  │
├─────────────────────────────────┤
│ 蓄積された文字起こし             │
│         7 / 10件                 │
│ ■■■■■■■□□□ (70%)          │
│ あと 3 件で自動生成されます      │
└─────────────────────────────────┘

**ビジュアル例（処理中）**:
```
┌─────────────────────────────────┐
│ 📝 原稿自動生成                  │
├─────────────────────────────────┤
│ 蓄積された文字起こし             │
│        10 / 10件                 │
│ ■■■■■■■■■■ (100%)        │
│ ✅ 10件到達 - 自動生成処理中...  │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│ 💡 質問提案                      │
├─────────────────────────────────┤
│ 次の提案まで: 3 / 5件            │
│ ■■■□□ (60%)                  │
│                                 │
│ ┌─────────────────────────┐   │
│ │ その技術を導入する際の    │   │
│ │ 課題は何でしたか？        │   │
│ └─────────────────────────┘   │
└─────────────────────────────────┘
```

#### 🔄 型定義の拡張

**ファイル**: `frontend/types/index.ts`

**追加したフィールド**:
```typescript
export interface InterviewSession {
  // ... 既存のフィールド
  
  // 新規追加
  last_article_transcript_index?: number;
  last_question_transcript_index?: number;
  pending_ai_article_count?: number;
  pending_ai_question_count?: number;
}

// 新規メッセージタイプ
export type WebSocketMessage = 
  // ... 既存のタイプ
  | { type: 'ai_counters_updated'; data: { 
      pending_article_count?: number; 
      pending_question_count?: number; 
    }}
  | { type: 'info'; message: string };
```

#### 🎮 エディタページの更新

**ファイル**: `frontend/app/editor/[sessionId]/page.tsx`

**追加した機能**:
1. AIカウンターのリアルタイム更新ハンドラ
2. AISuggestionsPanelへのprops追加
   - `pendingArticleCount` - 原稿生成待ち件数
   - `pendingQuestionCount` - 質問提案待ち件数
3. WebSocketメッセージ処理
   - `ai_counters_updated` - カウンター更新の受信
   - `info` - 情報メッセージの受信

---

### 2. バックエンド改善

#### 🔌 WebSocketハンドラーの拡張

**ファイル**: `backend/websocket_handler.py`

**変更内容**:
- `info` メッセージタイプの追加（情報通知用）
- エラーハンドリングの改善

#### 📡 リアルタイムカウンター更新

**ファイル**: `backend/transcription_manager.py`

**変更内容**:
- 文字起こし追加後、AIカウンターをブロードキャスト

```python
# 発話追加後
await self.broadcast(session_id, {
    'type': 'utterance_added',
    'data': utterance.model_dump()
})

# カウンター更新をブロードキャスト
await self.broadcast(session_id, {
    'type': 'ai_counters_updated',
    'data': {
        'pending_article_count': session.pending_ai_article_count,
        'pending_question_count': session.pending_ai_question_count
    }
})
```

**ファイル**: `backend/summary_task.py`

**変更内容**:
- 原稿生成完了後、カウンターをブロードキャスト
- 質問提案完了後、カウンターをブロードキャスト

```python
# 原稿生成後
await ws_manager.broadcast(session_id, {
    'type': 'ai_counters_updated',
    'data': {
        'pending_article_count': pending,
        'pending_question_count': session.pending_ai_question_count
    }
})

# 質問提案後
await ws_manager.broadcast(session_id, {
    'type': 'ai_counters_updated',
    'data': {
        'pending_article_count': session.pending_ai_article_count,
        'pending_question_count': pending
    }
})
```

---

## データフロー図

### Before（改善前）

```
[文字起こし追加]
    ↓
[バックグラウンドでAI処理]
    ↓
[原稿が突然更新される] ← ユーザーは何が起きたか分からない
```

### After（改善後）

```
[文字起こし追加]
    ↓
[カウンター更新: 7/10件] ← リアルタイム表示
    ↓
[プログレスバー更新: 70%] ← 視覚的フィードバック
    ↓
[10件到達]
    ↓
[「✅ 10件到達 - 自動生成処理中...」表示] ← 処理状況を明示
    ↓
[AI処理実行（バックグラウンド）]
    ↓
[原稿更新] ← WebSocketで通知
    ↓
[カウンターリセット: 0/10件] ← 次の処理待ちへ
```

---

## 技術的な実装詳細

### WebSocketメッセージフロー

#### 1. 文字起こし追加時

```
Client → Server: { type: "audio_chunk", data: {...} }
Server → Whisper API: [音声データ]
Whisper API → Server: [文字起こしテキスト]
Server → Client: { type: "utterance_added", data: {...} }
Server → Client: { type: "ai_counters_updated", data: {
                    pending_article_count: 7,
                    pending_question_count: 3
                  }}
```

#### 2. 自動処理時（10件到達）

```
Server: [pending_article_count が 10 に到達]
Server → Gemini API: [原稿生成リクエスト]
Gemini API → Server: [生成された原稿]
Server → Client: { type: "article_updated", data: {...} }
Server → Client: { type: "ai_counters_updated", data: {
                    pending_article_count: 0,  ← リセット
                    pending_question_count: 3
                  }}
```

---

## テスト項目

### 機能テスト

- [ ] 文字起こしが追加されるごとにカウンターが増加する
- [ ] プログレスバーが正しく更新される（0%→100%）
- [ ] 10件到達時に「✅ 10件到達 - 自動生成処理中...」が表示される
- [ ] 原稿が自動生成される（10件ごと）
- [ ] 原稿生成後、カウンターが自動的にリセットされる
- [ ] 質問提案が5件ごとに自動生成される
- [ ] 要約が正しく表示される

### UI/UXテスト

- [ ] プログレスバーのアニメーションがスムーズ
- [ ] 処理状況の表示が分かりやすい
- [ ] 処理中の表示が適切（「処理中...」の表示）
- [ ] エラー時の通知が表示される
- [ ] 逐次処理が視覚的に理解できる

### パフォーマンステスト

- [ ] 大量の文字起こしでもスムーズに動作
- [ ] WebSocketの遅延が許容範囲内
- [ ] メモリリークがない

---

## ファイル変更一覧

### フロントエンド

| ファイル | 変更内容 |
|---------|---------|
| `components/AISuggestionsPanel.tsx` | プログレスバー、手動トリガーボタン追加 |
| `types/index.ts` | 型定義追加（pending counts, WebSocket messages） |
| `app/editor/[sessionId]/page.tsx` | ハンドラー追加、props渡し |

### バックエンド

| ファイル | 変更内容 |
|---------|---------|
| `websocket_handler.py` | 手動トリガーメッセージハンドラー追加 |
| `transcription_manager.py` | カウンターブロードキャスト追加 |
| `summary_task.py` | カウンターブロードキャスト追加 |

### ドキュメント

| ファイル | 変更内容 |
|---------|---------|
| `docs/AI機能の説明.md` | 新規作成 |
| `docs/CHANGELOG_AI機能改善.md` | 新規作成 |

---

## 今後の改善案

### 短期（優先度: 高）

- [ ] AI生成時の詳細なプログレス表示（「Gemini API呼び出し中...」「原稿生成中...」など）
- [ ] 処理完了時のトースト通知（「原稿セクションが追加されました」）
- [ ] エラー時の詳細なメッセージと自動リトライ

### 中期（優先度: 中）

- [ ] しきい値のカスタマイズ機能（設定画面で10件→5件など）
- [ ] AI生成履歴の表示（過去の生成ログ）
- [ ] 複数の質問提案を一度に表示

### 長期（優先度: 低）

- [ ] AI生成品質の評価機能（👍/👎フィードバック）
- [ ] カスタムプロンプト設定（ユーザー独自のスタイル）
- [ ] 生成速度の最適化（並列処理の検討）

---

## まとめ

この改善により、**AI機能の処理状況が完全に可視化**され、ユーザーは:

- ✅ AI処理の進捗状況をリアルタイムで把握できる
- ✅ 自動生成のタイミングを予測できる
- ✅ どれくらい処理が進んでいるか一目で分かる
- ✅ システムが逐次的に処理していることを理解できる
- ✅ 手動操作不要で自動的に記事が生成される

**結果**: ユーザーエクスペリエンスが大幅に向上し、AI機能の動作が透明になりました。


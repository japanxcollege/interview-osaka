# AI機能の説明

このドキュメントでは、インタビューエディターのAI機能（原稿自動生成と質問提案）について説明します。

## 概要

システムは**Gemini API**を使用して、以下の3つの主要なAI機能を提供します:

1. **原稿の自動生成** - 文字起こしから記事セクションを自動生成
2. **質問提案** - インタビューの流れに応じた質問を提案
3. **要約生成** - 3分ごとの要約と最終要約

---

## 1. 原稿の自動生成

### 仕組み

- **トリガー条件**: 文字起こしが10件蓄積されるごとに自動実行
- **処理内容**: 
  - 10件の文字起こしを1つのまとまった記事セクションに変換
  - Markdown形式（`## 小見出し` + 本文）で生成
  - 既存の原稿に自動追記

### UI表示

右側の「**AI提案**」パネルに以下が表示されます:

```
📝 原稿自動生成
─────────────────────────────
蓄積された文字起こし: 7 / 10件
■■■■■■■□□□ (70%)
あと 3 件で自動生成されます
```

10件に達すると自動的に処理が開始され、以下のように表示されます:

```
📝 原稿自動生成
─────────────────────────────
蓄積された文字起こし: 10 / 10件
■■■■■■■■■■ (100%)
✅ 10件到達 - 自動生成処理中...
```

### 逐次処理

原稿生成は完全に自動化されており、ユーザーの操作は不要です。システムが10件ごとに自動的に処理します。

### バックエンド実装

- **ファイル**: `backend/summary_task.py`
- **メソッド**: `_maybe_generate_article_section`
- **API**: `gemini_client.generate_article_section`

```python
# 10件ごとに自動生成
if pending_ai_article_count >= 10:
    article_section = await gemini_client.generate_article_section(
        current_article=session.article_draft.text,
        recent_transcript=new_utterances,
        front_summary=session.front_summary
    )
    # 原稿に追記
    await session_manager.append_article_section(...)
```

---

## 2. 質問提案

### 仕組み

- **トリガー条件**: 文字起こしが5件蓄積されるごとに自動実行
- **処理内容**:
  - これまでの会話の流れを分析
  - 次に聞くべき具体的な質問を1つ提案
  - 重複する質問は避ける

### UI表示

```
💡 質問提案
─────────────────────────────
次の提案まで: 3 / 5件
■■■□□ (60%)

提案された質問:
┌─────────────────────────┐
│ その技術を導入する際の    │
│ 課題は何でしたか？        │
└─────────────────────────┘
```

### バックエンド実装

- **ファイル**: `backend/summary_task.py`
- **メソッド**: `_maybe_suggest_question`
- **API**: `gemini_client.suggest_question`

---

## 3. 要約生成

### 3分要約（front_summary）

- **タイミング**: 録音中、3分ごとに自動実行
- **内容**: 直近3分以前の発話を要約
- **用途**: 会話全体の文脈を把握

### 最終要約（auto_summary）

- **タイミング**: 録音停止時
- **内容**: インタビュー全体の要約
- **用途**: セッションの完全な振り返り

---

## データフロー

### 1. 文字起こし追加時

```
[音声入力] 
  → Whisper API (文字起こし)
  → TranscriptionManager.add_transcription_text()
  → pending_ai_article_count += 1
  → pending_ai_question_count += 1
  → WebSocket: ai_counters_updated ブロードキャスト
```

### 2. AI処理トリガー

```
[文字起こし追加完了]
  → summary_task.process_transcript_update()
  
  ┌─ pending_ai_article_count >= 10?
  │    └→ YES: 原稿セクション生成
  │           → 原稿に追記
  │           → pending_ai_article_count -= 10
  │
  └─ pending_ai_question_count >= 5?
       └→ YES: 質問提案生成
              → suggested_questions に追加
              → pending_ai_question_count -= 5
```

### 3. 手動トリガー

```
[ユーザーが「今すぐ生成」ボタンクリック]
  → WebSocket: trigger_article_generation
  → summary_task.process_transcript_update()
  → (上記と同じ処理)
```

---

## 設定とカスタマイズ

### 環境変数

```bash
# .env ファイル
GEMINI_API_KEY=your_gemini_api_key_here
```

### しきい値の変更

`backend/summary_task.py` で調整可能:

```python
# 原稿生成のしきい値（デフォルト: 10件）
if pending >= 10:  # ← ここを変更
    ...

# 質問提案のしきい値（デフォルト: 5件）
if pending >= 5:  # ← ここを変更
    ...
```

---

## トラブルシューティング

### 原稿が生成されない

1. **Gemini APIキーの確認**
   ```bash
   # バックエンドログをチェック
   ✅ Gemini API initialized  # ← これが表示されるか確認
   ```

2. **カウンターの確認**
   - 右側のAI提案パネルで「7 / 10件」のような表示を確認
   - 10件に達しているか確認

3. **ログの確認**
   ```bash
   # バックエンドログ
   📝 Article generation check: pending=10
   ✅ Gemini generated article section for session_xxx (234 chars)
   ```

### 質問が提案されない

- 発話が5件に達しているか確認
- 直近の会話に具体的な内容があるか確認（雑談だけだと提案されにくい）

---

## フロントエンド実装詳細

### コンポーネント構成

```
EditorPage (app/editor/[sessionId]/page.tsx)
  ├─ ArticlePanel (原稿編集)
  ├─ TranscriptPanel (文字起こし)
  ├─ NotesPanel (メモ)
  └─ AISuggestionsPanel (AI提案) ← 新機能
       ├─ 原稿自動生成の状況表示
       │   └─ プログレスバー + 手動トリガーボタン
       ├─ 質問提案の状況表示
       │   └─ プログレスバー + 提案リスト
       ├─ 3分要約表示
       └─ 最終要約表示
```

### WebSocketメッセージ

```typescript
// AIカウンター更新
{
  type: 'ai_counters_updated',
  data: {
    pending_article_count: 7,
    pending_question_count: 3
  }
}

// 原稿更新
{
  type: 'article_updated',
  data: {
    text: "## 新しいセクション\n\n本文...",
    last_updated: "2025-11-12T12:34:56.789Z"
  }
}

// 質問提案
{
  type: 'question_suggested',
  data: {
    question: "その技術を導入する際の課題は何でしたか？"
  }
}
```

---

## まとめ

- ✅ **原稿自動生成**: 10件の文字起こしごとに記事セクションを自動生成
- ✅ **質問提案**: 5件の文字起こしごとに次の質問を提案
- ✅ **リアルタイムフィードバック**: プログレスバーでAI処理状況を可視化
- ✅ **手動トリガー**: 必要に応じて即座に生成可能
- ✅ **要約機能**: 3分ごとの要約と最終要約で会話全体を把握

これにより、インタビュアーはAIの支援を受けながら、より効率的にインタビューを進められます。


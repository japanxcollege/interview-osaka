# Interview Editor Osaka - Whisper Integration

リアルタイムインタビューエディター - Whisper API統合版

## 特徴

- 🎤 **音声録音**: Web Audio APIで高品質録音
- 🤖 **音声認識**: OpenAI Whisper APIでリアルタイム文字起こし
- ✨ **AI支援**: Gemini APIで質問提案・原稿自動生成
- 📝 **原稿編集**: Markdown対応、リアルタイムプレビュー
- 💡 **質問提案**: 会話の流れに応じた質問を自動提案
- 📊 **要約機能**: 3分ごとの要約と最終要約
- 🔄 **リアルタイム同期**: WebSocketで複数デバイス対応
- 🚫 **Discord非依存**: Webアプリで完結

## 技術スタック

- **フロントエンド**: Next.js 14, TypeScript, React, TailwindCSS
- **バックエンド**: FastAPI, Python 3.11+
- **音声認識**: OpenAI Whisper API
- **AI機能**: Google Gemini API (2.0 Flash)
- **リアルタイム通信**: WebSocket
- **データ保存**: JSON (ローカル) or PostgreSQL (本番)

## セットアップ

### バックエンド

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
python main.py  # デフォルトでポート8005
```

### フロントエンド

```bash
cd frontend
npm install
# デフォルトポートは 3002
npm run dev
```

## 環境変数

### バックエンド (.env)

```bash
# 必須
OPENAI_API_KEY=your_openai_api_key_here    # Whisper API用
GEMINI_API_KEY=your_gemini_api_key_here    # Gemini AI用

# オプション
FRONTEND_URL=http://localhost:3000          # CORS設定用
BACKEND_PORT=8005                           # リッスンポート（デフォルト8005）
```

### フロントエンド (.env.local)

```bash
NEXT_PUBLIC_API_URL=http://localhost:8005   # バックエンドURL
```

## 開発

現在のプロジェクト（interviewdashboard）から以下を引き継ぎます：

- フロントエンドのコンポーネント構造
- バックエンドの基本アーキテクチャ
- WebSocket通信の仕組み

新規追加：

- AudioRecorder Component（音声録音）
- Whisper Client（音声認識）
- リアルタイム音声処理

## 🚀 デプロイ

### 最小コスト構成（$0～$7/月）

詳細は [デプロイガイド](./docs/デプロイガイド_最小コスト.md) と [DEPLOY.md](./DEPLOY.md) を参照してください。

**推奨構成**:
- **フロントエンド**: Vercel（無料）
- **バックエンド**: Render.com（無料 or $7/月）
- **AI API**: Gemini (無料60 RPM) + Whisper (従量課金)

**月額コスト**: $0～$10

詳細な手順:
```bash
# 1. GitHubにpush
git push origin main

# 2. Render.comでバックエンドをデプロイ
#    → backend/render.yaml を使用

# 3. Vercelでフロントエンドをデプロイ
#    → frontend/vercel.json を使用

# 4. 環境変数を設定して完了
```

## 📚 ドキュメント

- [AI機能の説明](./docs/AI機能の説明.md)
- [変更履歴](./docs/CHANGELOG_AI機能改善.md)
- [デプロイガイド（最小コスト）](./docs/デプロイガイド_最小コスト.md)
- [デプロイ手順](./DEPLOY.md)

## ライセンス

MIT














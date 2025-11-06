# Interview Editor Osaka - Whisper Integration

リアルタイムインタビューエディター - Whisper API統合版

## 特徴

- 🎤 Web Audio APIで音声録音
- 🤖 OpenAI Whisper APIで音声認識
- ⚡ リアルタイム文字起こし
- ♿ アクセシビリティ対応
- 🚫 Discord非依存（Webアプリで完結）

## 技術スタック

- **フロントエンド**: Next.js 14, TypeScript, React
- **バックエンド**: FastAPI, Python
- **音声認識**: OpenAI Whisper API
- **リアルタイム通信**: WebSocket

## セットアップ

### バックエンド

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

### フロントエンド

```bash
cd frontend
npm install
npm run dev
```

## 環境変数

### バックエンド

```bash
OPENAI_API_KEY=your_openai_api_key_here
FRONTEND_URL=http://localhost:3000
```

### フロントエンド

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
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

## ライセンス

MIT


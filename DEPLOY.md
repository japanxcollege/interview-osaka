# デプロイ手順（クイックスタート）

## 📋 前提条件
- GitHubアカウント
- Render.comアカウント（無料）
- Vercelアカウント（無料）
- Gemini API Key
- OpenAI API Key (Whisper用)

---

## 🚀 5ステップでデプロイ

### ステップ1: GitHubにpush

```bash
cd /Users/shuta/jxc/interview-osaka

# .gitignoreを確認
echo ".env" >> .gitignore
echo "backend/data/sessions/*.json" >> .gitignore
echo "backend/*.log" >> .gitignore

# コミット
git add .
git commit -m "Prepare for deployment"
git push origin main
```

---

### ステップ2: バックエンドをRender.comにデプロイ

1. https://render.com にログイン
2. **New → Web Service**
3. **Connect repository** → GitHubリポジトリを選択
4. 以下を設定:
   ```
   Name: interview-editor-backend
   Environment: Python 3
   Region: Singapore
   Branch: main
   Root Directory: backend
   Build Command: pip install -r requirements.txt
   Start Command: uvicorn main:app --host 0.0.0.0 --port $PORT
   Plan: Free (または Starter $7/月)
   ```

5. **Environment Variables** を追加:
   ```
   GEMINI_API_KEY = your_gemini_key_here
   OPENAI_API_KEY = your_openai_key_here
   PYTHON_VERSION = 3.11.14
   ```

6. **Advanced** → **Add Disk**:
   ```
   Name: sessions-data
   Mount Path: /app/data
   Size: 1 GB
   ```

7. **Create Web Service**

8. デプロイ完了後、URLをコピー（例: `https://interview-editor-backend.onrender.com`）

---

### ステップ3: フロントエンドをVercelにデプロイ

1. https://vercel.com にログイン
2. **Add New → Project**
3. GitHubリポジトリをインポート
4. 以下を設定:
   ```
   Framework Preset: Next.js
   Root Directory: frontend
   Build Command: npm run build
   Output Directory: .next
   Install Command: npm install
   ```

5. **Environment Variables** を追加:
   ```
   NEXT_PUBLIC_API_URL = https://interview-editor-backend.onrender.com
   ```
   （ステップ2でコピーしたURL）

6. **Deploy**

7. デプロイ完了後、URLをコピー（例: `https://your-app.vercel.app`）

---

### ステップ4: CORS設定を更新

バックエンドの `main.py` を更新:

```python
# CORS設定
allowed_origins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "https://your-app.vercel.app",  # ← ステップ3のVercel URLを追加
]
```

コミット & Push:
```bash
git add backend/main.py
git commit -m "Update CORS for production"
git push origin main
```

Render.comが自動的に再デプロイします。

---

### ステップ5: 動作確認

1. Vercelのアプリを開く: `https://your-app.vercel.app`
2. 新しいセッションを作成
3. 録音開始
4. 文字起こしが表示されるか確認
5. 10件溜まったら原稿が自動生成されるか確認

---

## 🔧 トラブルシューティング

### WebSocketエラー
**症状**: `WebSocket connection failed`

**解決**:
- Render.comのURLが正しいか確認
- `https://`を使用しているか確認（`http://`は不可）
- CORS設定にVercelのドメインが含まれているか確認

### Render.comがスリープする
**症状**: しばらくアクセスしないと30秒かかる

**解決**:
1. **無料で対策**: UptimeRobot で5分ごとにping
2. **$7/月**: Starter プランにアップグレード（24時間稼働）

### データが消える
**症状**: 再デプロイ後にセッションデータが消える

**解決**:
- Disk設定を確認（`/app/data`にマウント）
- 本番環境ではSupabase等のDB推奨

---

## 📊 コスト

### 無料プラン
- Vercel: $0
- Render.com: $0（スリープあり）
- Gemini API: $0（60 RPM無料）
- Whisper API: 従量課金（1時間=$0.36）

**月額合計**: $0～$5

### 本番プラン
- Vercel: $0（または $20/月 Proプラン）
- Render.com: $7/月（24時間稼働）
- Gemini API: $0（無料枠内）
- Whisper API: 従量課金

**月額合計**: $7～$27

---

## 🎉 完了！

これで、AIインタビューエディターが本番環境で動作します！











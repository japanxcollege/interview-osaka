# Python 3.11の軽量イメージを使用
FROM python:3.11-slim

# 出力のバッファリングを無効化 (ログが見やすくなる)
ENV PYTHONUNBUFFERED=1

# 作業ディレクトリを設定
WORKDIR /app

# システムの依存関係をインストール (FFmpeg)
# キャッシュを削除してイメージサイズを削減
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# 依存関係ファイルをコピーしてインストール
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# アプリケーションコードをコピー
COPY . .

# ポート設定 (Renderは環境変数PORTを使用)
ENV PORT=8000

# 起動コマンド (render.yamlのstartCommandが優先されるが、ローカル実行用にも設定)
CMD uvicorn main:app --host 0.0.0.0 --port $PORT

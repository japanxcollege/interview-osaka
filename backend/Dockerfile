# Python 3.11の標準イメージを使用 (ビルド依存関係のため)
FROM python:3.11

# システムの依存関係をインストール (FFmpegを含む)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# 作業ディレクトリを設定
WORKDIR /app

# 依存関係ファイルをコピーしてインストール
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# アプリケーションコードをコピー
COPY . .

# ポート設定 (Renderは環境変数PORTを使用)
ENV PORT=8000

# 起動コマンド
CMD uvicorn main:app --host 0.0.0.0 --port $PORT

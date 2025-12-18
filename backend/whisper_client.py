"""
Whisper API Client
音声データをOpenAIのWhisper APIで文字起こしする
"""

import asyncio
import base64
import io
import logging
import os
from typing import Optional, Tuple

import ffmpeg
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()
logger = logging.getLogger(__name__)


class WhisperClient:
    """OpenAI Whisper APIクライアント"""

    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None):
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        self.model = model or os.getenv("WHISPER_MODEL", "gpt-4o-mini-transcribe")
        self.language = os.getenv("WHISPER_LANGUAGE")

        self.client: Optional[OpenAI] = None
        self.enabled = False
        self._init_openai_client()

    def _init_openai_client(self) -> None:
        if not self.api_key:
            logger.warning("⚠️ OPENAI_API_KEY not set. Whisper transcription disabled.")
            self.enabled = False
            return

        try:
            self.client = OpenAI(api_key=self.api_key)
            self.enabled = True
            logger.info(f"✅ OpenAI Whisper client initialised (model={self.model})")
        except Exception as exc:
            logger.error(f"Failed to initialise OpenAI Whisper client: {exc}")
            self.enabled = False
            self.client = None

    async def transcribe_file(self, file_path: str, prompt: Optional[str] = None) -> Optional[str]:
        """ファイル全体を文字起こし (非同期)"""
        if not self.enabled:
            return None
        
        loop = asyncio.get_event_loop()
        try:
            with open(file_path, "rb") as f:
                audio_bytes = f.read()
                
            response = await loop.run_in_executor(
                None,
                self._transcribe_blocking,
                audio_bytes,
                os.path.basename(file_path),
                prompt
            )

            if not response:
                return None

            text = getattr(response, "text", None)
            if not text and isinstance(response, dict):
                text = response.get("text")
                
            # Local model string return
            if isinstance(response, str):
                text = response

            return text
        except Exception as e:
            logger.error(f"File transcription failed: {e}")
            return None

    async def transcribe_audio_chunk(
        self,
        audio_base64: str,
        mime_type: str = "audio/webm",
        prompt: Optional[str] = None
    ) -> Optional[str]:
        """
        音声チャンクを文字起こし

        Args:
            audio_base64: Base64エンコードされた音声データ
            mime_type: 音声のMIMEタイプ（例: audio/webm, audio/wav）
            prompt: Whisper APIに渡すコンテキスト/プロンプト（オプション）

        Returns:
            文字起こし結果のテキスト or None
        """
        if not self.enabled:
            logger.debug("Whisper client disabled, skipping transcription")
            return None

        if not audio_base64:
            logger.warning("Received empty audio chunk")
            return None

        try:
            audio_bytes = base64.b64decode(audio_base64)
        except Exception as exc:
            logger.error(f"Failed to decode audio chunk: {exc}")
            return None

        if not audio_bytes:
            logger.warning("Audio chunk decoded to empty bytes")
            return None

        if len(audio_bytes) < 4000:
            logger.debug("Audio chunk too small (%d bytes), skipping", len(audio_bytes))
            return None

        try:
            prepared_bytes, filename = self._prepare_audio_file(audio_bytes, mime_type)
        except Exception as exc:
            logger.error(f"Failed to prepare audio chunk: {exc}")
            return None

        if not prepared_bytes:
            logger.warning("Audio chunk preparation returned empty bytes")
            return None

        loop = asyncio.get_event_loop()
        try:
            response = await loop.run_in_executor(
                None,
                self._transcribe_blocking,
                prepared_bytes,
                filename,
                prompt
            )

            if not response:
                return None

            text = getattr(response, "text", None)
            if not text and isinstance(response, dict):
                text = response.get("text")

            if text:
                cleaned = text.strip()
                logger.info(f"🗣️ Whisper transcription: {cleaned[:80]}...")
                return cleaned or None

            logger.warning("Whisper response did not include text")
            return None
        except Exception as exc:
            logger.error(f"Whisper transcription failed: {exc}")
            return None

    def _transcribe_blocking(self, audio_bytes: bytes, filename: str, prompt: Optional[str] = None):
        """
        Whisper API呼び出し（同期関数）
        run_in_executor から呼び出す
        """
        if not self.client:
            return None

        audio_file = io.BytesIO(audio_bytes)
        audio_file.name = filename  # OpenAIクライアントがファイル名を参照

        params = {
            "model": self.model,
            "file": (filename, audio_bytes)
        }

        if self.language:
            params["language"] = self.language

        if prompt:
            params["prompt"] = prompt

        # gpt-4o-mini-transcribe などは text 属性で結果を返す
        return self.client.audio.transcriptions.create(**params)

    def _prepare_audio_file(
        self,
        audio_bytes: bytes,
        mime_type: str
    ) -> Tuple[bytes, str]:
        """Whisper API に投げられる形式へ整形"""
        mime = (mime_type or "").lower()

        if "webm" in mime or "ogg" in mime:
            # Skip ffmpeg conversion to avoid binary dependency on Render
            # and to keep upload size small (WebM/Opus < WAV)
            ext = "webm" if "webm" in mime else "ogg"
            return audio_bytes, f"chunk.{ext}"

        extension = self._mime_to_extension(mime_type)
        return audio_bytes, f"chunk.{extension}"

    def _convert_to_wav(self, audio_bytes: bytes, mime: str) -> bytes:
        """ffmpeg を利用して WAV (PCM 16kHz mono) へ変換"""
        try:
            input_kwargs = {}
            if "webm" in mime:
                input_kwargs["format"] = "matroska"
            elif "ogg" in mime:
                input_kwargs["format"] = "ogg"

            process = (
                ffmpeg
                .input('pipe:0', **input_kwargs)
                .output(
                    'pipe:1',
                    format='wav',
                    acodec='pcm_s16le',
                    ac=1,
                    ar='16000'
                )
                .run_async(pipe_stdin=True, pipe_stdout=True, pipe_stderr=True)
            )
            stdout, stderr = process.communicate(input=audio_bytes)
        except FileNotFoundError:
            raise RuntimeError(
                "ffmpeg binary not found. Please install ffmpeg and ensure it is in PATH."
            )

        if process.returncode != 0:
            error_output = stderr.decode(errors='ignore') if stderr else 'unknown error'
            raise RuntimeError(f"ffmpeg conversion failed: {error_output}")

        return stdout

    @staticmethod
    def _mime_to_extension(mime_type: str) -> str:
        if not mime_type:
            return "webm"

        mapping = {
            "audio/webm": "webm",
            "audio/wav": "wav",
            "audio/wave": "wav",
            "audio/x-wav": "wav",
            "audio/mpeg": "mp3",
            "audio/mp3": "mp3",
            "audio/ogg": "ogg",
            "audio/x-m4a": "m4a",
            "audio/aac": "aac",
        }
        return mapping.get(mime_type.lower(), "webm")


# グローバルインスタンス
whisper_client = WhisperClient()


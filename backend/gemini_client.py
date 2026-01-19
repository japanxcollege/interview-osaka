"""
Gemini API Client
AI質問提案と要約生成
"""

import os
import re
import logging
from pathlib import Path
from typing import List, Optional
from dotenv import load_dotenv
import google.generativeai as genai
from models import Utterance

BASE_DIR = Path(__file__).resolve().parents[1]
load_dotenv()
load_dotenv(dotenv_path=BASE_DIR / ".env", override=False)
load_dotenv(dotenv_path=BASE_DIR / "backend" / ".env", override=True) # Backend specific env wins
logger = logging.getLogger(__name__)


class GeminiClient:
    """Gemini APIクライアント"""

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("GEMINI_API_KEY")
        if not self.api_key:
            logger.warning("⚠️ GEMINI_API_KEY not set. AI features will be disabled.")
            self.enabled = False
            return

        try:
            genai.configure(api_key=self.api_key)
            
            # Safety settings to allow all content (since this is an editor for adults/interviews)
            from google.generativeai.types import HarmCategory, HarmBlockThreshold
            
            self.safety_settings = {
                HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_NONE,
                HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_NONE,
                HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_NONE,
                HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_NONE,
            }
            
            self.model = genai.GenerativeModel(
                'gemini-flash-latest',
                # safety_settings=self.safety_settings # Constructor might accept it or generate_content
            )
            self.enabled = True
            logger.info("✅ Gemini API initialized with BLOCK_NONE safety settings")
        except Exception as e:
            logger.error(f"Failed to initialize Gemini API: {e}")
            self.enabled = False

    async def suggest_question(
        self,
        front_summary: str,
        recent_transcript: List[Utterance],
        previous_questions: Optional[List[str]] = None
    ) -> Optional[str]:
        """
        インタビューの質問を提案

        Args:
            front_summary: これまでの要約
            recent_transcript: 直近の発話リスト
            previous_questions: 既に提案した質問の履歴

        Returns:
            提案質問 or None
        """
        if not self.enabled:
            return None

        try:
            # 直近の発話をテキスト化
            recent_text = "\n".join([
                f"{u.speaker_name}: {u.text}"
                for u in recent_transcript[-5:]  # 最新5発話
            ])
            previous_text = "\n".join(
                f"- {q.strip()}"
                for q in (previous_questions or [])
                if q and q.strip()
            )

            prompt = f"""あなたはインタビュアーをサポートするAIです。

# これまでの会話の要約
{front_summary if front_summary else "（まだ要約なし）"}

# 直近の会話
{recent_text}

# これまでにAIが提案した質問
{previous_text if previous_text else "（まだありません）"}

上記の会話を踏まえて、インタビュアーが次に尋ねるべき質問を1つ提案してください。
質問は具体的で、会話を深めるものにしてください。
- これまでに提案した質問や、それとほぼ同じ趣旨の質問は避けてください。
- すでに回答されている内容を繰り返さないでください。
- 会話内容に即した質問にしてください（汎用的な「どのようなお話ですか？」などは禁止）。

回答は質問文のみを出力してください（説明不要）。
"""

            response = await self.model.generate_content_async(prompt, safety_settings=self.safety_settings)
            query_text = response.text.strip()

            logger.info(f"💡 Suggested question: {query_text[:50]}...")
            return query_text

        except Exception as e:
            logger.error(f"Failed to suggest question: {e}")
            return None

    async def summarize_transcript(
        self,
        utterances: List[Utterance]
    ) -> Optional[str]:
        """
        発話リストを要約

        Args:
            utterances: 発話リスト

        Returns:
            要約テキスト or None
        """
        if not self.enabled:
            return None

        if not utterances:
            return ""

        try:
            # 発話をテキスト化
            transcript_text = "\n".join([
                f"{u.speaker_name}: {u.text}"
                for u in utterances
            ])

            prompt = f"""以下のインタビューの会話を要約してください。

# 会話内容
{transcript_text}

要約のルール:
- 3-5文程度で簡潔に
- 話された主要なトピックを含める
- 話者名を含めて「〇〇さんは...」という形式で

要約:
"""

            response = await self.model.generate_content_async(prompt)
            summary = response.text.strip()

            logger.info(f"📝 Generated summary: {len(summary)} chars")
            return summary

        except Exception as e:
            logger.error(f"Failed to summarize transcript: {e}")
            return None

    async def generate_final_summary(
        self,
        front_summary: str,
        recent_transcript: List[Utterance]
    ) -> Optional[str]:
        """
        最終要約を生成

        Args:
            front_summary: 前半の要約
            recent_transcript: 直近の発話

        Returns:
            最終要約 or None
        """
        if not self.enabled:
            return None

        try:
            recent_text = "\n".join([
                f"{u.speaker_name}: {u.text}"
                for u in recent_transcript
            ])

            prompt = f"""インタビュー全体の最終要約を作成してください。

# 前半の要約
{front_summary if front_summary else "（なし）"}

# 後半の会話
{recent_text}

最終要約:
- 5-10文程度
- インタビュー全体の流れを把握できるように
- 重要なポイントを箇条書きで含める
"""

            response = await self.model.generate_content_async(prompt)
            summary = response.text.strip()

            logger.info(f"📄 Generated final summary: {len(summary)} chars")
            return summary

        except Exception as e:
            logger.error(f"Failed to generate final summary: {e}")
            return None

    async def improve_selected_text(
        self,
        selected_text: str,
        instruction: str,
        context: str = ""
    ) -> Optional[str]:
        """
        選択範囲のテキストを改善

        Args:
            selected_text: 選択されたテキスト
            instruction: 改善指示（"ブラッシュアップ", "書き直し", カスタムプロンプト）
            context: 前後の文脈

        Returns:
            改善されたテキスト or None
        """
        if not self.enabled:
            return None

        try:
            prompt = f"""あなたはプロのライターです。
以下の選択されたテキストを改善してください。

# 選択されたテキスト
{selected_text}

# 前後の文脈（参考）
{context if context else "（文脈なし）"}

# 指示
{instruction}

# 重要な注意事項
- 選択されたテキストの部分だけを改善してください
- コードフェンス（```markdown など）は使わないでください
- 純粋な改善後のテキストのみを出力してください

改善後のテキスト:
"""

            response = await self.model.generate_content_async(prompt)
            improved = response.text.strip()

            # コードフェンスを削除
            if improved.startswith('```markdown'):
                improved = improved[len('```markdown'):].strip()
            if improved.startswith('```'):
                improved = improved[3:].strip()
            if improved.endswith('```'):
                improved = improved[:-3].strip()

            logger.info(f"✨ Improved text: {len(improved)} chars")
            return improved

        except Exception as e:
            logger.error(f"Failed to improve text: {e}")
            return None

    async def restructure_as_subsection(
        self,
        selected_text: str,
        full_article: str
    ) -> Optional[str]:
        """
        選択範囲を1つの小見出し（##）セクションに再構成

        Args:
            selected_text: 選択されたテキスト
            full_article: 記事全体

        Returns:
            再構成されたセクション（## 見出し付き）or None
        """
        if not self.enabled:
            return None

        try:
            prompt = f"""あなたはプロのライターです。
以下の選択されたテキストを、1つのまとまった小見出しセクションに再構成してください。

# 記事全体（参考）
{full_article}

# 選択範囲（この部分を再構成）
{selected_text}

# 指示
1. 選択範囲の内容を分析し、適切な小見出し（##）を生成してください
2. 散らばった内容を、1つのまとまった文章に再構成してください
3. 記事のトーンに合わせてください
4. Markdown形式で出力してください
5. コードフェンス（```markdown）は使わないでください

再構成されたセクション:
"""

            response = await self.model.generate_content_async(prompt)
            section = response.text.strip()

            # コードフェンスを削除
            if section.startswith('```markdown'):
                section = section[len('```markdown'):].strip()
            if section.startswith('```'):
                section = section[3:].strip()
            if section.endswith('```'):
                section = section[:-3].strip()

            logger.info(f"📦 Restructured subsection: {len(section)} chars")
            return section

        except Exception as e:
            logger.error(f"Failed to restructure subsection: {e}")
            return None

    async def restructure_as_section(
        self,
        selected_text: str,
        full_article: str
    ) -> Optional[str]:
        """
        選択範囲を1つの大見出し（#）セクションに再構成

        Args:
            selected_text: 選択されたテキスト
            full_article: 記事全体

        Returns:
            再構成されたセクション（# 見出し付き）or None
        """
        if not self.enabled:
            return None

        try:
            prompt = f"""あなたはプロのライターです。
以下の選択されたテキストを、1つのまとまった大見出しセクションに再構成してください。

# 記事全体（参考）
{full_article}

# 選択範囲（この部分を再構成）
{selected_text}

# 指示
1. 選択範囲の内容を分析し、適切な大見出し（#）を生成してください
2. より大きなチャンクとして、複数の小見出し（##）を含む構造的なセクションに再構成してください
3. 散らばった内容を、論理的な流れを持つまとまった文章に再構成してください
4. 記事のトーンに合わせてください
5. Markdown形式で出力してください
6. コードフェンス（```markdown）は使わないでください

再構成されたセクション:
"""

            response = await self.model.generate_content_async(prompt)
            section = response.text.strip()

            # コードフェンスを削除
            if section.startswith('```markdown'):
                section = section[len('```markdown'):].strip()
            if section.startswith('```'):
                section = section[3:].strip()
            if section.endswith('```'):
                section = section[:-3].strip()

            logger.info(f"📦 Restructured major section: {len(section)} chars")
            return section

        except Exception as e:
            logger.error(f"Failed to restructure section: {e}")
            return None

    async def generate_article_section(
        self,
        current_article: str,
        recent_transcript: List[Utterance],
        front_summary: str = ""
    ) -> Optional[str]:
        """
        文字起こしから記事セクションを生成・追記

        Args:
            current_article: 現在の原稿内容
            recent_transcript: 直近の発話リスト（最新5発話）
            front_summary: これまでの要約（文脈補強用）

        Returns:
            追加すべき記事セクション or None
        """
        if not self.enabled:
            return None

        try:
            # 直近の発話をテキスト化
            recent_text = "\n".join([
                f"{u.speaker_name}: {u.text}"
                for u in recent_transcript
            ])


            prompt = f"""あなたはインタビュー記事のライターです。
文字起こしを元に、記事の一部を**Markdown形式**で書いてください。

# 現在の記事内容
{current_article if current_article else "（まだ記事がありません。最初のセクションを書いてください。）"}

# これまでの要約（参考）
{front_summary if front_summary else "（要約なし）"}

# 直近の会話（文字起こし）
{recent_text}

# 指示
1. **必ず `##` で始まる小見出しを付けてください**（例: `## AIエージェントの可能性`）
2. 小見出しの後に、会話内容を自然な文章に変換した本文を書いてください
3. インタビュイーの発言はそのまま引用し、記事として読みやすくしてください
4. 既存の記事内容を繰り返さないでください
5. 150-300文字程度の短いセクションにしてください
6. **絶対に** ```markdown のようなコードフェンスは使わないでください
7. **絶対に**タイムスタンプや話者名（[19:23:55] Interviewer:）を含めないでください

出力形式（必ず守ってください）:
## 小見出し

本文（自然な記事文体で）
"""

            response = await self.model.generate_content_async(prompt)
            section = response.text.strip()

            # コードフェンスを削除（念のため）
            if section.startswith('```markdown'):
                section = section[len('```markdown'):].strip()
            if section.startswith('```'):
                section = section[3:].strip()
            if section.endswith('```'):
                section = section[:-3].strip()

            # タイムスタンプ付き発話行を削除（[HH:MM:SS] Speaker:）
            lines = section.split('\n')
            cleaned_lines = []
            for line in lines:
                # [19:23:55] Interviewer: のようなパターンをスキップ
                if re.match(r'^\[\d{2}:\d{2}:\d{2}\]\s+\w+:\s*', line):
                    continue
                cleaned_lines.append(line)
            section = '\n'.join(cleaned_lines).strip()

            logger.info(f"📝 Generated article section: {len(section)} chars")
            return section

        except Exception as e:
            logger.error(f"Failed to generate article section: {e}")
            return None

    async def generate_text(self, system_prompt: str, user_prompt: str) -> Optional[str]:
        # ... (docstring) ...
        if not self.enabled:
            print("DEBUG: generate_text - Client disabled (gemini)")
            return None

        try:
            print(f"DEBUG: generate_text - Start. Model: {self.model.model_name}")
            full_prompt = f"{system_prompt}\n\n---\n\n{user_prompt}"
            response = await self.model.generate_content_async(full_prompt, safety_settings=self.safety_settings)
            
            print(f"DEBUG: generate_text - Response received. Candidates: {len(response.candidates)}")
            
            if response.prompt_feedback and response.prompt_feedback.block_reason:
                print(f"DEBUG: generate_text - Blocked: {response.prompt_feedback}")
                logger.warning(f"⚠️ Prompt blocked: {response.prompt_feedback}")
                return None
            return response.text.strip()
        except Exception as e:
            print(f"DEBUG: generate_text - Exception: {e}")
            logger.error(f"Failed to generate text (Gemini): {e}")
            self.last_error = str(e)
            return None


# グローバルインスタンス
gemini_client = GeminiClient()

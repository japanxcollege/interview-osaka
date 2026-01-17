
import logging
from typing import Optional
from gemini_client import gemini_client
from anthropic_client import anthropic_client
from style_manager import style_manager

logger = logging.getLogger(__name__)

class AIEditorService:
    def __init__(self):
        pass

    async def edit_text(
        self,
        instruction: str,
        selected_text: Optional[str] = None,
        context: Optional[str] = None,
        model_provider: str = "gemini",
        chat_history: list = []
    ) -> Optional[str]:
        """
        指定されたモデルでテキスト編集/生成を実行
        """
        system_prompt = """あなたはプロのライター・編集者です。
ユーザーの指示に従って、テキストを作成、編集、または改善してください。
「要約」や「相談」の場合は、会話形式で答えてください。
「編集」や「書き直し」の場合は、結果のMarkdownテキストのみを出力してください。
"""

        user_content = []
        
        # Add chat history context if available
        if chat_history:
            history_text = "\n".join([f"{msg.role}: {msg.content}" for msg in chat_history])
            user_content.append(f"# これまでの会話履歴\n{history_text}\n")

        if context:
            user_content.append(f"# 文脈・背景\n{context}\n")
        
        if selected_text:
            user_content.append(f"# 対象テキスト\n{selected_text}\n")
            
        user_content.append(f"# 今回の指示\n{instruction}")
        
        user_prompt = "\n".join(user_content)

        if model_provider == "claude":
            if not anthropic_client.enabled:
                raise Exception("Claude API is not enabled. Check ANTHROPIC_API_KEY.")
            return await anthropic_client.generate_text(system_prompt, user_prompt)
        
        else: # Default to Gemini
            if not gemini_client.enabled:
                raise Exception("Gemini API is not enabled. Check GEMINI_API_KEY.")
            return await gemini_client.generate_text(system_prompt, user_prompt)

    async def generate_draft_from_transcript(
        self,
        transcript_text: str,
        style: str,
        key_points: Optional[list[str]] = None,
        context: Optional[str] = None,
        model_provider: str = "gemini"
    ) -> Optional[str]:
        """
        文字起こし + スタイル + キーポイント から記事ドラフトを生成
        """
        # Dynamic style lookup
        prompt_style = style_manager.get_by_id(style)
        style_instruction = prompt_style.instruction if prompt_style else "Q&A形式（対談形式）で、質問と回答が明確に分かるように構成してください。"
        
        key_points_text = ""
        if key_points:
            key_points_list = "\n".join([f"- {kp}" for kp in key_points])
            key_points_text = f"\n# ユーザーが重視するポイント（必ず記事に反映してください）\n{key_points_list}\n"

        system_prompt = """あなたはプロのライターです。
渡された「文字起こしテキスト」を元に、高品質な記事ドラフトを作成してください。
"""
        
        context_text = ""
        if context:
            context_text = f"\n# 追加コンテキスト・背景情報（参考メモ）\n{context}\n"

        user_prompt = f"""
# 指示
{style_instruction}
{context_text}
{key_points_text}

# 文字起こしテキスト
{transcript_text}

# 出力形式
Markdown形式で出力してください。
タイトル（#）から始めてください。
"""

        if model_provider == "claude":
             if anthropic_client.enabled:
                 return await anthropic_client.generate_text(system_prompt, user_prompt)
        
        # Default Gemini
        if gemini_client.enabled:
             return await gemini_client.generate_text(system_prompt, user_prompt)
             
    async def generate_interviewer_response(
        self,
        transcript_text: str,
        context: Optional[str] = None,
        chat_history: list = [],
        model_provider: str = "gemini"
    ) -> Optional[str]:
        """
        インタビューの進行役として、次の質問や反応を生成する
        """
        system_prompt = """あなたはプロのインタビュアーです。
渡された文字起こしテキストとこれまでの会話を元に、次に尋ねるべき質問、または話を引き出すための相槌・反応を生成してください。

# 振舞い
- 相手の話を深掘りし、新しい発見を引き出すような質問をしてください。
- 親しみやすく、かつプロフェッショナルなトーンを保ってください。
- 音声で読み上げることを前提に、自然な話し言葉（です・ます調）で短めに答えてください。
- 一度に多くの質問をせず、1つずつ深掘りしてください。
"""
        
        user_content = []
        
        if context:
            user_content.append(f"# インタビューの目的・背景\n{context}\n")
            
        if chat_history:
            history_text = "\n".join([f"{msg.get('role', 'unknown')}: {msg.get('content', '')}" for msg in chat_history])
            user_content.append(f"# これまでのAIとのやり取り\n{history_text}\n")
            
        if transcript_text:
            user_content.append(f"# 現在の文字起こし（ユーザーの発言など）\n{transcript_text}\n")
            
        user_content.append("次に、インタビュアーとしてどのような発言をすべきか、発言内容のみを出力してください。")
        
        user_prompt = "\n".join(user_content)

        if model_provider == "claude":
            if anthropic_client.enabled:
                return await anthropic_client.generate_text(system_prompt, user_prompt)
        
        # Default Gemini
        if gemini_client.enabled:
            return await gemini_client.generate_text(system_prompt, user_prompt)
            
        return None


ai_editor = AIEditorService()


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
        model_provider: str = "gemini"
    ) -> Optional[str]:
        """
        指定されたモデルでテキスト編集/生成を実行
        """
        system_prompt = """あなたはプロのライター・編集者です。
ユーザーの指示に従って、テキストを作成、編集、または改善してください。
出力はMarkdown形式で行い、余計な説明は省いてください。"""

        user_content = []
        if context:
            user_content.append(f"# 文脈・背景\n{context}\n")
        
        if selected_text:
            user_content.append(f"# 対象テキスト\n{selected_text}\n")
            
        user_content.append(f"# 指示\n{instruction}")
        
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

        user_prompt = f"""
# 指示
{style_instruction}
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
             
        return None


ai_editor = AIEditorService()

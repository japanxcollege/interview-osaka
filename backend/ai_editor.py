
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
        # Instructions for editing text
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
        model_provider: str = "gemini",
        ai_mode: str = "empath"
    ) -> Optional[str]:
        """
        インタビューの進行役として、次の質問や反応を生成する
        モード: empath (共感/深掘り), friction (違和感/矛盾指摘), rephrase (言い換え/構造化)
        """
        
        mode_instruction = ""
        if ai_mode == "friction":
            mode_instruction = """
# モード: 違和感・矛盾の指摘 (Friction)
- ユーザーの話の中に潜む「矛盾」や「曖昧な点」、「建前と本音のズレ」を優しく指摘してください。
- "あえて" 少し批判的な視点や、異なる視点を投げかけてください。
- 目的はユーザーに「ハッ」とさせることです。攻撃的にならないよう注意してください。
"""
        elif ai_mode == "rephrase":
            mode_instruction = """
# モード: 言い換え・構造化 (Rephrase)
- ユーザーの話を整理・要約し、「つまり、こういうことですか？」と確認してください。
- 話の構造（原因と結果、対立軸など）を提示してください。
- 抽象的な話を具体化したり、具体的な話を抽象化して返してください。
"""
        else: # empath (default)
            mode_instruction = """
# モード: 共感・深掘り (Empathy)
- 相手の感情に寄り添い、共感を示してください。
- 「なぜそう感じたのですか？」「具体的には？」と優しく深掘りしてください。
- ユーザーが安心して話せる雰囲気を作ってください。肯定的なフィードバックを重視してください。
"""

        system_prompt = f"""あなたはプロのインタビュアーです。
渡された文字起こしテキストとこれまでの会話を元に、次に尋ねるべき質問、または話を引き出すための反応を生成してください。

{mode_instruction}

# 基本的な振舞い
- 親しみやすく、かつプロフェッショナルなトーンを保ってください。
- 音声で読み上げることを前提に、自然な話し言葉（です・ます調）で短めに答えてください。
- 一度に多くの質問をせず、1つずつ深掘りしてください。
- 決して「結論」を押し付けないでください。ユーザーに気づきを与えることが目的です。
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

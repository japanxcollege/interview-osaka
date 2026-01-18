import os
import asyncio
import google.generativeai as genai
from dotenv import load_dotenv
from google.generativeai.types import HarmCategory, HarmBlockThreshold

# Load environment variables
load_dotenv()

async def test_gemini():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("❌ Error: GEMINI_API_KEY is not set.")
        return

    print(f"🔑 API Key found: {api_key[:5]}...{api_key[-5:]}")

    try:
        genai.configure(api_key=api_key)
        
        safety_settings = {
            HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_NONE,
            HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_NONE,
            HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_NONE,
            HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_NONE,
        }

        print("⚙️  Configuring model: gemini-1.5-flash with BLOCK_NONE safety settings...")
        model = genai.GenerativeModel('gemini-1.5-flash')

        print("🚀 Sending test prompt: 'Hello, are you working?'...")
        response = await model.generate_content_async(
            "Hello, are you working?",
            safety_settings=safety_settings
        )
        
        if response.text:
            print(f"✅ Success! Response: {response.text}")
        else:
            print(f"⚠️  Response empty. Prompt feedback: {response.prompt_feedback}")

    except Exception as e:
        print(f"❌ Exception occurred: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_gemini())

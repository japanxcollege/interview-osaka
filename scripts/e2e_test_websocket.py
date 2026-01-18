import asyncio
import sys
import json
import websockets
import os
from dotenv import load_dotenv

# Load environment variables from backend/.env if available
load_dotenv(os.path.join(os.path.dirname(__file__), '../backend/.env'))

async def e2e_test():
    # Use remote URL if provided, otherwise localhost
    backend_url = os.getenv("BACKEND_URL", "ws://localhost:8005")
    # Handle http/https prefix replacement to ws/wss if needed
    if backend_url.startswith("http"):
        backend_url = backend_url.replace("http", "ws")
    
    uri = f"{backend_url}/ws/e2e_test_session"
    print(f"🔌 Connecting to {uri}...")
    
    try:
        async with websockets.connect(uri) as websocket:
            print("✅ Connected!")
            
            # Wait for initial status (optional)
            try:
                initial = await asyncio.wait_for(websocket.recv(), timeout=2.0)
                print(f"📥 Initial status: {initial}")
            except asyncio.TimeoutError:
                pass

            # 1. Send improve_text request
            payload = {
                "type": "improve_text",
                "data": {
                    "instruction": "Hello, please reply with 'Test Successful'",
                    "selected_text": "",
                    "messages": []
                }
            }
            print(f"📤 Sending: {json.dumps(payload)}")
            await websocket.send(json.dumps(payload))
            
            # 2. Receive response
            print("⏳ Waiting for AI response...")
            while True:
                response = await asyncio.wait_for(websocket.recv(), timeout=30.0)
                data = json.loads(response)
                print(f"📨 Received: {data}")
                
                if data.get("type") == "text_improved":
                    print("✅ AI Confirmation Received!")
                    print(f"📝 Result: {data['data']['improved_text']}")
                    break
                if data.get("type") == "error":
                    print(f"❌ Error Received: {data.get('message')}")
                    sys.exit(1)
                    
            print("🎉 E2E Test Passed!")
            
    except Exception as e:
        print(f"❌ Test Failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(e2e_test())

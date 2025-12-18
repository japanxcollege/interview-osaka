#!/usr/bin/env python3
"""
TranscriptionManagerのコールバック設定を確認するスクリプト
"""

import sys
from pathlib import Path

# プロジェクトのルートをパスに追加
sys.path.insert(0, str(Path(__file__).resolve().parent))

from main import transcription_manager, summary_task_manager

print("=" * 60)
print("TranscriptionManager Callback Check")
print("=" * 60)

print(f"\n📊 TranscriptionManager enabled: {transcription_manager.enabled}")
print(f"📊 on_transcription_appended callback: {transcription_manager.on_transcription_appended}")
print(f"📊 Callback function: {transcription_manager.on_transcription_appended.__name__ if transcription_manager.on_transcription_appended else 'None'}")
print(f"📊 SummaryTaskManager: {summary_task_manager}")
print(f"📊 process_transcript_update method: {summary_task_manager.process_transcript_update}")

print("\n✅ Callback is configured correctly!" if transcription_manager.on_transcription_appended else "❌ Callback is NOT configured!")
print("=" * 60)











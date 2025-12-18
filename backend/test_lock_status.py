#!/usr/bin/env python3
"""
ロックの状態を確認するスクリプト
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from main import summary_task_manager

print("=" * 60)
print("Lock Status Check")
print("=" * 60)

print(f"\n📊 Processing locks: {summary_task_manager.processing_locks}")
print(f"📊 Number of locks: {len(summary_task_manager.processing_locks)}")

for session_id, lock in summary_task_manager.processing_locks.items():
    print(f"\n🔒 Session: {session_id}")
    print(f"   - Lock locked: {lock.locked()}")
    print(f"   - Lock object: {lock}")

print("\n" + "=" * 60)











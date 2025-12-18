#!/usr/bin/env python3
"""
既存のセッションデータをクリアするユーティリティ

使い方:
  python3 clear_sessions.py           # 全セッションを削除
  python3 clear_sessions.py SESSION_ID # 特定のセッションのみ削除
"""

import sys
from pathlib import Path

def clear_all_sessions():
    """全セッションファイルを削除"""
    data_dir = Path(__file__).parent / "data"
    if not data_dir.exists():
        print("❌ dataディレクトリが見つかりません")
        return
    
    session_files = list(data_dir.glob("session_*.json"))
    if not session_files:
        print("✅ クリアするセッションファイルはありません")
        return
    
    print(f"⚠️  {len(session_files)}件のセッションファイルを削除します:")
    for f in session_files:
        print(f"  - {f.name}")
    
    confirm = input("\n本当に削除しますか？ (yes/no): ")
    if confirm.lower() != 'yes':
        print("❌ キャンセルしました")
        return
    
    for f in session_files:
        f.unlink()
        print(f"🗑️  削除: {f.name}")
    
    print(f"\n✅ {len(session_files)}件のセッションファイルを削除しました")

def clear_session(session_id: str):
    """特定のセッションファイルを削除"""
    data_dir = Path(__file__).parent / "data"
    session_file = data_dir / f"session_{session_id}.json"
    
    if not session_file.exists():
        print(f"❌ セッション {session_id} が見つかりません")
        return
    
    print(f"⚠️  セッションファイルを削除します: {session_file.name}")
    confirm = input("本当に削除しますか？ (yes/no): ")
    if confirm.lower() != 'yes':
        print("❌ キャンセルしました")
        return
    
    session_file.unlink()
    print(f"✅ セッション {session_id} を削除しました")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        session_id = sys.argv[1]
        clear_session(session_id)
    else:
        clear_all_sessions()












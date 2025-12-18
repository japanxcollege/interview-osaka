#!/bin/bash
# AI処理の診断スクリプト

echo "======================================"
echo "AI Processing Diagnosis"
echo "======================================"
echo ""

SESSION_FILE=$(ls -t data/sessions/*.json | head -1)
SESSION_ID=$(basename "$SESSION_FILE" .json)

echo "📋 Latest Session: $SESSION_ID"
echo ""

# セッション情報
python3 -c "
import json
with open('$SESSION_FILE') as f:
    data = json.load(f)
    print(f'📊 Status: {data[\"status\"]}')
    print(f'📊 Transcript count: {len(data[\"transcript\"])}')
    print(f'📊 Pending article: {data[\"pending_ai_article_count\"]}')
    print(f'📊 Pending question: {data[\"pending_ai_question_count\"]}')
    print(f'📊 Last processed: {data[\"last_article_transcript_index\"]}')
    print(f'📊 Article length: {len(data[\"article_draft\"][\"text\"])} chars')
    print(f'📊 Questions: {len(data[\"suggested_questions\"])}')
"

echo ""
echo "======================================"
echo "Recent Backend Logs (last 30 lines)"
echo "======================================"
tail -30 backend.log 2>/dev/null || echo "backend.log not found"

echo ""
echo "======================================"
echo "AI Processing Calls"
echo "======================================"
grep "🚀 process_transcript_update CALLED" backend.log 2>/dev/null | tail -10 || echo "No AI processing calls found"

echo ""
echo "======================================"
echo "AI Processing Completions"
echo "======================================"
grep "✅ process_transcript_update COMPLETED" backend.log 2>/dev/null | tail -10 || echo "No completions found"

echo ""
echo "======================================"
echo "Article Generation"
echo "======================================"
grep "📝 Article generation check" backend.log 2>/dev/null | tail -10 || echo "No article generation checks found"

echo ""
echo "======================================"
echo "Errors"
echo "======================================"
grep -i "error\|failed\|exception" backend.log 2>/dev/null | tail -20 || echo "No errors found"











/**
 * 型定義
 * バックエンドのPydanticモデルに対応
 */

export interface Utterance {
  utterance_id: string;
  speaker_id: string;
  speaker_name: string;
  timestamp: string; // ISO 8601
  text: string;
}

export interface Note {
  note_id: string;
  timestamp: string; // ISO 8601
  text: string;
}

export interface ArticleDraft {
  draft_id: string; // New
  name: string;     // New
  style_id: string; // New
  text: string;
  last_updated: string; // ISO 8601
}

export type SessionStatus = 'preparing' | 'recording' | 'editing' | 'completed';

export interface InterviewSession {
  session_id: string;
  session_key?: string; // Phase 1
  title: string;
  created_at: string; // ISO 8601
  status: SessionStatus;
  transcript: Utterance[];
  article_draft: ArticleDraft;
  drafts: ArticleDraft[]; // Phase 6: Multi-draft
  notes: Note[];
  discord_channel_id?: string; // Phase 1
  discord_voice_channel_id?: string; // Phase 1
  front_summary?: string; // Phase 1: 3分要約
  recent_transcript?: Utterance[]; // Phase 1: 直近の発話
  suggested_questions?: string[]; // Phase 1: AI質問提案
  auto_summary?: string; // Phase 1: 最終要約
  last_article_transcript_index?: number; // Phase 1: 原稿生成に利用済みの発話数
  last_question_transcript_index?: number; // Phase 1: 質問提案に利用済みの発話数
  pending_ai_article_count?: number; // Phase 1: 原稿生成用の未処理カウント
  pending_ai_question_count?: number; // Phase 1: 質問提案用の未処理カウント
  upload_progress?: number;
  upload_error?: string | null;
  interview_style?: string;
  user_key_points?: string[];
  context?: string;
}

// WebSocketメッセージ型
export type WebSocketMessage =
  | { type: 'initial_data'; data: InterviewSession }
  | { type: 'utterance_added'; data: Utterance }
  | { type: 'utterance_edited'; data: { utterance_id: string; text: string; speaker_name: string } }
  | { type: 'utterance_deleted'; data: { utterance_id: string } }
  | { type: 'article_updated'; data: { text: string; last_updated: string } }
  | { type: 'note_added'; data: Note }
  | { type: 'note_deleted'; data: { note_id: string } }
  | { type: 'status_updated'; data: { status: SessionStatus } }
  | { type: 'question_suggested'; data: { question: string } } // Phase 1
  | { type: 'summary_updated'; data: { front_summary?: string; auto_summary?: string } } // Phase 1
  | { type: 'text_improved'; data: { improved_text: string; start_pos: number; end_pos: number } } // AIブラッシュアップ結果
  | { type: 'ai_counters_updated'; data: { pending_article_count?: number; pending_question_count?: number } } // AIカウンター更新
  | { type: 'interviewer_response'; data: { text: string } }
  | { type: 'info'; message: string }
  | { type: 'error'; message: string };

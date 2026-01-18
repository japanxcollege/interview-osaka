"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { InterviewSession, WebSocketMessage } from '@/types';
import { WebSocketClient } from '@/lib/websocket';
import SplitEditor from './SplitEditor';
import VersionHistory from './VersionHistory';

interface ReflectionPanelProps {
    session: InterviewSession;
    wsClient: WebSocketClient | null;
}

export default function ReflectionPanel({ session, wsClient }: ReflectionPanelProps) {
    const router = useRouter();
    const [facts, setFacts] = useState(session.draft_content?.facts_md || '');
    const [feelings, setFeelings] = useState(session.draft_content?.feelings_md || '');
    const [aiMode, setAiMode] = useState(session.ai_mode || 'empath');
    const [isSaving, setIsSaving] = useState(false);
    const [showHistory, setShowHistory] = useState(false);

    // Sync local state with session updates from WS
    useEffect(() => {
        if (session.draft_content) {
            // Logic to resolve conflicts or force update could go here.
        }
    }, [session.draft_content]);

    const handleContentChange = async (newFacts: string, newFeelings: string) => {
        setFacts(newFacts);
        setFeelings(newFeelings);

        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8005';
            await fetch(`${apiUrl}/api/sessions/${session.session_id}/content`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    facts_md: newFacts,
                    feelings_md: newFeelings
                })
            });
        } catch (e) {
            console.error("Failed to auto-save content", e);
        }
    };

    const handleModeChange = async (mode: string) => {
        setAiMode(mode);
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8005';
            await fetch(`${apiUrl}/api/sessions/${session.session_id}/mode`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode })
            });
        } catch (e) {
            console.error("Failed to update mode", e);
        }
    };

    const handleSaveVersion = async () => {
        setIsSaving(true);
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8005';
            await fetch(`${apiUrl}/api/sessions/${session.session_id}/versions`, {
                method: 'POST'
            });
            alert('Version saved!');
        } catch (e) {
            console.error("Failed to save version", e);
            alert('Failed to save');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-neutral-900 text-white relative">
            {/* Header / Controls */}
            <div className="h-16 border-b border-neutral-800 flex items-center justify-between px-6 bg-neutral-900">
                <div className="flex items-center gap-4">
                    <h1 className="text-lg font-bold tracking-wide">{session.title}</h1>
                    <div className="flex gap-2">
                        {session.axes_selected?.map((axis) => (
                            <span key={axis} className="px-2 py-0.5 rounded border border-neutral-700 text-xs text-neutral-400 capitalize">
                                {axis === 'next' ? 'Future' : axis}
                            </span>
                        ))}
                    </div>
                </div>

                <div className="flex items-center gap-6">
                    {/* AI Mode Selector */}
                    <div className="flex bg-neutral-800 rounded-lg p-1">
                        {['empath', 'friction', 'rephrase'].map((mode) => (
                            <button
                                key={mode}
                                onClick={() => handleModeChange(mode)}
                                className={`px-3 py-1.5 rounded-md text-sm capitalize transition-all ${aiMode === mode
                                        ? 'bg-neutral-600 text-white shadow-sm'
                                        : 'text-neutral-400 hover:text-neutral-200'
                                    }`}
                            >
                                {mode}
                            </button>
                        ))}
                    </div>

                    <button
                        onClick={handleSaveVersion}
                        disabled={isSaving}
                        className="px-4 py-2 bg-white text-black text-sm font-bold rounded-lg hover:bg-neutral-200 transition-colors"
                    >
                        {isSaving ? 'Saving...' : 'Save Version'}
                    </button>

                    <button
                        onClick={() => setShowHistory(prev => !prev)}
                        className="text-neutral-400 hover:text-white"
                    >
                        History
                    </button>

                    <button
                        onClick={() => router.push(`/interviewer/${session.session_id}/export`)}
                        className="text-neutral-400 hover:text-blue-400 font-medium"
                    >
                        Export
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-hidden p-4 relative flex">
                <div className="flex-1 h-full">
                    <SplitEditor
                        factsContent={facts}
                        feelingsContent={feelings}
                        onFactsChange={(val) => handleContentChange(val, feelings)}
                        onFeelingsChange={(val) => handleContentChange(facts, val)}
                    />
                </div>

                {showHistory && (
                    <VersionHistory
                        versions={session.versions || []}
                        onClose={() => setShowHistory(false)}
                        onSelectVersion={(v) => {
                            if (confirm("Load this version? Any unsaved changes will be overwritten.")) {
                                // Assuming snapshot structure matches
                                const s = v.snapshot;
                                const f = s.draft_content?.facts_md || "";
                                const e = s.draft_content?.feelings_md || "";
                                setFacts(f);
                                setFeelings(e);
                                handleContentChange(f, e);
                                setShowHistory(false);
                            }
                        }}
                    />
                )}
            </div>
        </div>
    );
}

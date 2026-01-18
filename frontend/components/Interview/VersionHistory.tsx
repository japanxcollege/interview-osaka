"use client";

import React from 'react';
import { Version } from '@/types';

interface VersionHistoryProps {
    versions: Version[];
    currentVersionId?: string;
    onSelectVersion: (version: Version) => void;
    onClose: () => void;
}

export default function VersionHistory({ versions, currentVersionId, onSelectVersion, onClose }: VersionHistoryProps) {
    return (
        <div className="w-80 border-l border-neutral-800 bg-neutral-900 flex flex-col h-full absolute right-0 top-0 z-50 shadow-2xl">
            <div className="p-4 border-b border-neutral-800 flex justify-between items-center">
                <h2 className="font-bold text-white">History</h2>
                <button onClick={onClose} className="text-neutral-500 hover:text-white">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto">
                {versions.length === 0 && (
                    <div className="p-4 text-sm text-neutral-500 text-center">No history yet.</div>
                )}
                {versions.slice().reverse().map((v) => (
                    <div
                        key={v.version_id}
                        className={`p-4 border-b border-neutral-800 cursor-pointer hover:bg-neutral-800 transition-colors ${currentVersionId === v.version_id ? 'bg-neutral-800' : ''}`}
                        onClick={() => onSelectVersion(v)}
                    >
                        <div className="flex justify-between mb-1">
                            <span className="font-medium text-white">v{v.version_number}</span>
                            <span className="text-xs text-neutral-500">{new Date(v.created_at).toLocaleTimeString()}</span>
                        </div>
                        <div className="text-xs text-neutral-400 truncate">
                            {/* Summary or diff info could go here */}
                            Notes: {v.snapshot.notes_count || 0}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

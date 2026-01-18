"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NewSessionPage() {
    const router = useRouter();
    const [selectedAxes, setSelectedAxes] = useState<string[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const toggleAxis = (axis: string) => {
        setSelectedAxes(prev =>
            prev.includes(axis)
                ? prev.filter(a => a !== axis)
                : [...prev, axis]
        );
    };

    const startSession = async () => {
        if (selectedAxes.length === 0) return;

        setIsSubmitting(true);
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8005'}/api/sessions/start-v2`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: `Session ${new Date().toLocaleDateString()}`,
                    axes: selectedAxes
                })
            });

            if (!res.ok) throw new Error('Failed to create session');

            const session = await res.json();
            router.push(`/interviewer/${session.session_id}`);
        } catch (error) {
            console.error(error);
            alert('Failed to start session');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-neutral-900 text-white flex flex-col items-center justify-center p-4">
            <div className="max-w-md w-full space-y-8">
                <div className="text-center space-y-4">
                    <h1 className="text-2xl font-light tracking-wide">
                        今日は、考えを少し外に出すだけで大丈夫です
                    </h1>
                    <p className="text-neutral-400">
                        今から話すのはどれですか？（複数選択可）
                    </p>
                </div>

                <div className="space-y-3">
                    <AxisButton
                        label="過去"
                        sub="やってきたこと"
                        selected={selectedAxes.includes('past')}
                        onClick={() => toggleAxis('past')}
                    />
                    <AxisButton
                        label="現在"
                        sub="いま考えていること"
                        selected={selectedAxes.includes('now')}
                        onClick={() => toggleAxis('now')}
                    />
                    <AxisButton
                        label="未来"
                        sub="これからやりたいこと"
                        selected={selectedAxes.includes('next')}
                        onClick={() => toggleAxis('next')}
                    />
                </div>

                <div className="pt-8">
                    <button
                        onClick={startSession}
                        disabled={selectedAxes.length === 0 || isSubmitting}
                        className={`w-full py-4 rounded-full text-lg font-medium transition-all
              ${selectedAxes.length > 0
                                ? 'bg-white text-black hover:scale-[1.02]'
                                : 'bg-neutral-800 text-neutral-500 cursor-not-allowed'}
            `}
                    >
                        {isSubmitting ? '準備中...' : 'はじめる'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function AxisButton({ label, sub, selected, onClick }: { label: string, sub: string, selected: boolean, onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className={`w-full p-4 rounded-xl border flex items-center justify-between transition-all
        ${selected
                    ? 'border-white bg-white/10'
                    : 'border-neutral-700 hover:border-neutral-500 bg-transparent'}
      `}
        >
            <span className="text-lg font-medium">{label}</span>
            <span className="text-sm text-neutral-400">{sub}</span>
        </button>
    );
}

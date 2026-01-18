'use client';

import React, { useEffect, useState } from 'react';

export type ToastType = 'info' | 'success' | 'error' | 'warning';

export interface ToastMessage {
    id: string;
    message: string;
    type: ToastType;
    duration?: number;
}

interface ToastProps {
    toasts: ToastMessage[];
    removeToast: (id: string) => void;
}

/**
 * トースト通知コンポーネント
 */
export default function Toast({ toasts, removeToast }: ToastProps) {
    return (
        <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
            {toasts.map((toast) => (
                <ToastItem key={toast.id} toast={toast} onRemove={() => removeToast(toast.id)} />
            ))}
        </div>
    );
}

function ToastItem({ toast, onRemove }: { toast: ToastMessage; onRemove: () => void }) {
    const [isExiting, setIsExiting] = useState(false);

    useEffect(() => {
        const duration = toast.duration || 3000;
        const timer = setTimeout(() => {
            setIsExiting(true);
            setTimeout(onRemove, 300); // フェードアウト後に削除
        }, duration);

        return () => clearTimeout(timer);
    }, [toast, onRemove]);

    const bgColor = {
        info: 'bg-blue-600',
        success: 'bg-green-600',
        error: 'bg-red-600',
        warning: 'bg-yellow-600',
    }[toast.type];

    return (
        <div
            className={`
        ${bgColor} text-white px-4 py-3 rounded-lg shadow-xl pointer-events-auto
        flex items-center justify-between gap-3 transform transition-all duration-300
        ${isExiting ? 'opacity-0 translate-x-10' : 'opacity-100 translate-x-0'}
        animate-in slide-in-from-right-full
      `}
        >
            <div className="flex items-center gap-2">
                <span>
                    {toast.type === 'success' && '✅'}
                    {toast.type === 'error' && '❌'}
                    {toast.type === 'warning' && '⚠️'}
                    {toast.type === 'info' && 'ℹ️'}
                </span>
                <p className="text-sm font-medium">{toast.message}</p>
            </div>
            <button
                onClick={() => {
                    setIsExiting(true);
                    setTimeout(onRemove, 300);
                }}
                className="text-white/80 hover:text-white transition"
            >
                ✕
            </button>
        </div>
    );
}

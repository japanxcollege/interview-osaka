'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

// Type definitions for Web Speech API
interface SpeechRecognition extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    start: () => void;
    stop: () => void;
    abort: () => void;
    onresult: (event: any) => void;
    onerror: (event: any) => void;
    onend: (event: any) => void;
}

interface WebSpeechRecorderProps {
    isRecording: boolean;
    onInterimResult?: (text: string) => void;
    onFinalResult: (text: string) => void;
    onError?: (message: string) => void;
    lang?: string;
}

export default function WebSpeechRecorder({
    isRecording,
    onInterimResult,
    onFinalResult,
    onError,
    lang = 'ja-JP'
}: WebSpeechRecorderProps) {
    const [error, setError] = useState<string | null>(null);
    const recognitionRef = useRef<SpeechRecognition | null>(null);
    const isRecordingRef = useRef(false);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        // Check browser support
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
            const msg = 'このブラウザはWeb Speech APIに対応していません。ChromeまたはSafariをご利用ください。';
            setError(msg);
            onError?.(msg);
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = lang;

        recognition.onresult = (event: any) => {
            let interimTranscript = '';
            let finalTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }

            if (interimTranscript && onInterimResult) {
                onInterimResult(interimTranscript);
            }

            if (finalTranscript) {
                onFinalResult(finalTranscript);
                // Clear interim if final provided? Usually handled by UI clearing or overwriting.
                if (onInterimResult) onInterimResult('');
            }
        };

        recognition.onerror = (event: any) => {
            console.error('Speech recognition error', event.error);
            if (event.error === 'not-allowed') {
                onError?.('マイクの許可がありません');
            } else if (event.error === 'network') {
                // Network error often happens, just retry or ignore if transient
            }
        };

        recognition.onend = () => {
            // Auto-restart if still recording
            if (isRecordingRef.current) {
                try {
                    recognition.start();
                } catch (e) {
                    console.warn('Failed to restart recognition', e);
                }
            }
        };

        recognitionRef.current = recognition;

        return () => {
            recognition.abort();
        };
    }, [lang, onError, onFinalResult, onInterimResult]);

    useEffect(() => {
        isRecordingRef.current = isRecording;
        const recognition = recognitionRef.current;
        if (!recognition) return;

        if (isRecording) {
            try {
                recognition.start();
            } catch (e) {
                // Often throws if already started
                console.debug('Recognition start called but might be active', e);
            }
        } else {
            recognition.stop();
        }
    }, [isRecording]);

    if (error) {
        return <div className="text-red-500 text-xs">{error}</div>;
    }

    return null;
}

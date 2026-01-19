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
    const retryCountRef = useRef(0);
    const MAX_RETRIES = 3;

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
            // Successful result resets retry count
            retryCountRef.current = 0;

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
                if (onInterimResult) onInterimResult('');
            }
        };

        recognition.onerror = (event: any) => {
            if (event.error === 'network') {
                if (retryCountRef.current < MAX_RETRIES) {
                    retryCountRef.current += 1;
                    console.warn(`Speech network error. Retrying... (${retryCountRef.current}/${MAX_RETRIES})`);
                    // Don't set isRecordingRef to false yet, let onend handle restart
                    // But we might need to delay slightly to avoid thrashing?
                    // WebSpeech API usually stops after error. 'onend' will fire.
                } else {
                    console.warn('Speech recognition network error (Max retries reached, stopping)');
                    isRecordingRef.current = false;
                    onError?.('ネットワーク接続が不安定なため、音声認識を停止しました。');
                }
            } else if (event.error === 'not-allowed') {
                console.error('Speech recognition error', event.error);
                isRecordingRef.current = false;
                onError?.('マイクの許可がありません');
            } else if (event.error === 'aborted') {
                // Ignore
            } else {
                console.error('Speech recognition error', event.error);
                onError?.(`音声認識エラー: ${event.error}`);
            }
        };

        recognition.onend = () => {
            // Auto-restart if still recording
            if (isRecordingRef.current) {
                try {
                    // Slight delay for stability if we are retrying
                    const delay = retryCountRef.current > 0 ? 1000 : 0;
                    setTimeout(() => {
                        if (isRecordingRef.current) {
                            try { recognition.start(); } catch (e) { console.warn('Retry start failed', e); }
                        }
                    }, delay);
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
        if (isRecording) {
            // Reset retries on fresh start
            retryCountRef.current = 0;
            const recognition = recognitionRef.current;
            if (recognition) {
                try { recognition.start(); } catch (e) { console.debug('Start ignored', e); }
            }
        } else {
            recognitionRef.current?.stop();
        }
    }, [isRecording]);

    if (error) {
        return <div className="text-red-500 text-xs">{error}</div>;
    }

    return null;
}

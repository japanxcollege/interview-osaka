'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { WebSocketClient } from '@/lib/websocket';

type RecorderStatus = 'idle' | 'preparing' | 'recording' | 'stopped' | 'error';
type PermissionState = 'unknown' | 'granted' | 'denied';

interface AudioRecorderProps {
  sessionId: string;
  wsClient: WebSocketClient | null;
  isRecording: boolean;
  speakerId?: string;
  speakerName?: string;
  onError?: (message: string) => void;
}

interface StatusBadgeProps {
  status: RecorderStatus;
  permission: PermissionState;
  deviceLabel?: string;
}

const StatusBadge = ({ status, permission, deviceLabel }: StatusBadgeProps) => {
  const { label, color, description } = useMemo(() => {
    if (permission === 'denied') {
      return {
        label: 'マイクが許可されていません',
        color: 'bg-red-100 text-red-700 border-red-300',
        description: 'ブラウザの設定からマイク許可を有効にしてください'
      };
    }

    switch (status) {
      case 'preparing':
        return {
          label: 'マイク初期化中',
          color: 'bg-blue-100 text-blue-700 border-blue-300',
          description: 'マイクの準備をしています...'
        };
      case 'recording':
        return {
          label: '録音中',
          color: 'bg-red-100 text-red-700 border-red-300',
          description: deviceLabel ? `入力: ${deviceLabel}` : 'マイク入力を取得しています'
        };
      case 'stopped':
        return {
          label: '停止中',
          color: 'bg-gray-100 text-gray-600 border-gray-300',
          description: '録音を停止しています'
        };
      case 'error':
        return {
          label: 'マイクエラー',
          color: 'bg-red-100 text-red-700 border-red-300',
          description: 'エラーが発生しました。ブラウザを更新してください'
        };
      case 'idle':
      default:
        return {
          label: '待機中',
          color: 'bg-gray-100 text-gray-600 border-gray-300',
          description: '録音開始ボタンを押すと録音が始まります'
        };
    }
  }, [status, permission, deviceLabel]);

  return (
    <div className={`px-3 py-2 text-sm font-medium rounded-full border ${color}`}>
      <div className="flex items-center gap-2">
        <span>{label}</span>
        <span className="text-xs text-gray-500">{description}</span>
      </div>
    </div>
  );
};

export default function AudioRecorder({
  sessionId,
  wsClient,
  isRecording,
  speakerId = 'speaker_web',
  speakerName = 'Interviewer',
  onError
}: AudioRecorderProps) {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [permission, setPermission] = useState<PermissionState>('unknown');
  const [deviceLabel, setDeviceLabel] = useState<string | undefined>();
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const sampleBufferRef = useRef<Float32Array | null>(null);
  const isRecordingRef = useRef(false);
  const isUnmountedRef = useRef(false);
  const lastSentChunkRef = useRef<string | null>(null);

  const chunkIntervalMs = 300; // Check VAD status every 300ms
  const SILENCE_THRESHOLD = 0.005;
  const MIN_ACTIVE_SAMPLE_COUNT = 16000; // Min chunk size (1s) to avoid tiny noise
  const MAX_CHUNK_DURATION_MS = 8000; // Force send after 8s
  const SILENCE_DURATION_MS = 800; // Silence required to cut chunk

  const silenceStartRef = useRef<number | null>(null);
  const recordingStartTimeRef = useRef<number>(0);

  const reportError = useCallback(
    (message: string, error?: unknown) => {
      console.error('[AudioRecorder]', message, error);
      setStatus('error');
      onError?.(message);
    },
    [onError]
  );

  const releaseResources = useCallback(async () => {
    if (processorNodeRef.current) {
      processorNodeRef.current.disconnect();
      processorNodeRef.current.onaudioprocess = null;
      processorNodeRef.current = null;
    }
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    if (gainNodeRef.current) {
      gainNodeRef.current.disconnect();
      gainNodeRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        await audioContextRef.current.suspend();
      } catch (error) {
        console.warn('[AudioRecorder] Failed to suspend AudioContext', error);
      }
    }
    sampleBufferRef.current = null;
    lastSentChunkRef.current = null;
    isRecordingRef.current = false;
    setDeviceLabel(undefined);
  }, []);

  const cleanupMedia = useCallback(() => {
    releaseResources();
    setStatus('stopped');
  }, [releaseResources]);

  const arrayBufferToBase64 = useCallback((buffer: ArrayBuffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 1024;
    for (let i = 0; i < bytes.byteLength; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      let chunkString = '';
      for (let j = 0; j < chunk.length; j++) {
        chunkString += String.fromCharCode(chunk[j]);
      }
      binary += chunkString;
    }
    return btoa(binary);
  }, []);

  const resampleTo16k = useCallback((channelData: Float32Array, sourceRate: number) => {
    const targetSampleRate = 16000;
    const ratio = sourceRate / targetSampleRate;
    const downsampledLength = Math.floor(channelData.length / ratio);
    const downsampled = new Float32Array(downsampledLength);
    for (let i = 0; i < downsampledLength; i++) {
      downsampled[i] = channelData[Math.floor(i * ratio)];
    }
    return downsampled;
  }, []);

  const encodePcmToWav = useCallback((pcm: Float32Array, sampleRate: number) => {
    if (pcm.length === 0) {
      return new ArrayBuffer(0);
    }

    const buffer = new ArrayBuffer(44 + pcm.length * 2);
    const view = new DataView(buffer);

    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    const floatTo16BitPCM = (offset: number, data: Float32Array) => {
      for (let i = 0; i < data.length; i++, offset += 2) {
        let s = Math.max(-1, Math.min(1, data[i]));
        s = s < 0 ? s * 0x8000 : s * 0x7fff;
        view.setInt16(offset, s, true);
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + pcm.length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, pcm.length * 2, true);

    floatTo16BitPCM(44, pcm);
    return buffer;
  }, []);

  const calculateRms = useCallback((samples: Float32Array) => {
    if (samples.length === 0) {
      return 0;
    }
    let sumSquares = 0;
    for (let i = 0; i < samples.length; i++) {
      const value = samples[i];
      sumSquares += value * value;
    }
    return Math.sqrt(sumSquares / samples.length);
  }, []);

  const appendSamples = useCallback((chunk: Float32Array) => {
    if (chunk.length === 0) {
      return;
    }
    const existing = sampleBufferRef.current;
    if (!existing || existing.length === 0) {
      sampleBufferRef.current = chunk.slice();
      return;
    }
    const merged = new Float32Array(existing.length + chunk.length);
    merged.set(existing);
    merged.set(chunk, existing.length);
    sampleBufferRef.current = merged;
  }, []);

  const processBufferedSamples = useCallback(
    (force = false) => {
      const client = wsClient;
      if (!client || !client.isConnected()) {
        if (force) {
          sampleBufferRef.current = null;
          lastSentChunkRef.current = null;
        }
        return;
      }

      const buffer = sampleBufferRef.current;
      if (!buffer || buffer.length === 0) {
        return;
      }

      const sampleRate = audioContextRef.current?.sampleRate ?? 48000;
      const bufferDurationMs = (buffer.length / sampleRate) * 1000;

      // 1. Calculate RMS of the *recent* tail (last 300ms)
      const tailSamplesCount = Math.floor(sampleRate * 0.3);
      const tailSamples = buffer.length > tailSamplesCount
        ? buffer.slice(buffer.length - tailSamplesCount)
        : buffer;
      const currentRms = calculateRms(tailSamples);

      const isSilent = currentRms < SILENCE_THRESHOLD;
      const now = Date.now();

      // 2. Silence Timer Logic
      if (isSilent) {
        if (silenceStartRef.current === null) {
          silenceStartRef.current = now;
        }
      } else {
        silenceStartRef.current = null;
      }

      const silenceDuration = silenceStartRef.current ? now - silenceStartRef.current : 0;
      const shouldSend =
        force ||
        (bufferDurationMs > 1000 && silenceDuration > SILENCE_DURATION_MS) || // Sufficient audio + Silence
        (bufferDurationMs > MAX_CHUNK_DURATION_MS); // Force safety limit

      if (!shouldSend) {
        return;
      }

      // 3. Resample and Send
      const downsampled = resampleTo16k(buffer, sampleRate);

      // Reset buffers immediately
      sampleBufferRef.current = null;
      silenceStartRef.current = null;
      recordingStartTimeRef.current = now;

      if (downsampled.length < MIN_ACTIVE_SAMPLE_COUNT) {
        console.debug('[AudioRecorder] Skip chunk: too short', downsampled.length);
        return;
      }

      console.debug('[AudioRecorder] Sending chunk', {
        trigger: force ? 'FORCE' : (bufferDurationMs > MAX_CHUNK_DURATION_MS ? 'MAX_TIME' : 'VAD_SILENCE'),
        pcmLength: downsampled.length,
        durationSec: downsampled.length / 16000
      });

      const wavBuffer = encodePcmToWav(downsampled, 16000);
      const base64 = arrayBufferToBase64(wavBuffer);

      client.send('audio_chunk', {
        chunk: base64,
        mime_type: 'audio/wav',
        speaker_id: speakerId,
        speaker_name: speakerName,
        session_id: sessionId
      });
      lastSentChunkRef.current = base64;
    },
    [
      arrayBufferToBase64,
      calculateRms,
      chunkIntervalMs,
      encodePcmToWav,
      resampleTo16k,
      sessionId,
      speakerId,
      speakerName,
      wsClient
    ]
  );

  // Poll VAD status
  useEffect(() => {
    if (!isRecording) return;
    const interval = setInterval(() => {
      processBufferedSamples(false);
    }, chunkIntervalMs);
    return () => clearInterval(interval);
  }, [isRecording, processBufferedSamples, chunkIntervalMs]);

  const waitUntilWebSocketOpen = useCallback(
    async (client: WebSocketClient, timeoutMs = 5000) => {
      if (client.isConnected()) {
        return true;
      }

      return new Promise<boolean>((resolve) => {
        const check = () => {
          if (client.isConnected()) {
            clearInterval(intervalId);
            clearTimeout(timerId);
            resolve(true);
          }
        };

        const intervalId = setInterval(check, 200);
        const timerId = setTimeout(() => {
          clearInterval(intervalId);
          resolve(client.isConnected());
        }, timeoutMs);
      });
    },
    []
  );

  const initMedia = useCallback(async () => {
    if (typeof window === 'undefined') {
      throw new Error('ブラウザ環境でのみ録音が可能です');
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('このブラウザはマイク録音に対応していません');
    }

    try {
      setStatus('preparing');
      const constraints: MediaStreamConstraints = {
        audio: {
          channelCount: 1,
          sampleRate: 48000,
          noiseSuppression: true,
          echoCancellation: true
        },
        video: false
      };

      let stream: MediaStream | null = null;

      const tryGetStream = async () => {
        console.debug('[AudioRecorder] Requesting getUserMedia', constraints);
        return navigator.mediaDevices.getUserMedia(constraints);
      };
      stream = await tryGetStream();

      if (!stream) {
        throw new Error('マイク入力の取得に失敗しました (stream is null)');
      }

      mediaStreamRef.current = stream;

      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
          sampleRate: 48000
        });
      } else if (audioContextRef.current.state === 'suspended') {
        try {
          await audioContextRef.current.resume();
        } catch (error) {
          console.warn('[AudioRecorder] Failed to resume AudioContext', error);
        }
      }

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0) {
        setDeviceLabel(audioTracks[0].label);
      }

      if (processorNodeRef.current) {
        processorNodeRef.current.disconnect();
        processorNodeRef.current.onaudioprocess = null;
        processorNodeRef.current = null;
      }
      if (sourceNodeRef.current) {
        sourceNodeRef.current.disconnect();
        sourceNodeRef.current = null;
      }
      if (gainNodeRef.current) {
        gainNodeRef.current.disconnect();
        gainNodeRef.current = null;
      }

      const audioContext = audioContextRef.current;
      if (!audioContext) {
        throw new Error('AudioContextの初期化に失敗しました');
      }

      const sourceNode = audioContext.createMediaStreamSource(stream);
      const processorNode = audioContext.createScriptProcessor(4096, 1, 1);
      const gainNode = audioContext.createGain();
      gainNode.gain.value = 0;

      processorNode.onaudioprocess = (event: AudioProcessingEvent) => {
        if (!isRecordingRef.current) {
          return;
        }
        const input = event.inputBuffer.getChannelData(0);
        if (!input || input.length === 0) {
          return;
        }
        appendSamples(new Float32Array(input));
        processBufferedSamples(false);
      };

      sourceNode.connect(processorNode);
      processorNode.connect(gainNode);
      gainNode.connect(audioContext.destination);

      sourceNodeRef.current = sourceNode;
      processorNodeRef.current = processorNode;
      gainNodeRef.current = gainNode;

      setPermission('granted');
      return stream;
    } catch (err) {
      setPermission('denied');
      await releaseResources();
      throw err;
    }
  }, [appendSamples, processBufferedSamples, releaseResources]);

  const startRecording = useCallback(async () => {
    if (status === 'recording') {
      return;
    }

    if (!wsClient) {
      reportError('WebSocketクライアントが初期化されていません');
      return;
    }

    if (!wsClient.isConnected()) {
      console.warn('[AudioRecorder] WebSocket not connected, attempting to connect...');
      wsClient.connect();
      const connected = await waitUntilWebSocketOpen(wsClient, 5000);
      if (!connected) {
        reportError('WebSocket接続の確立に失敗しました');
        return;
      }
    }

    try {
      await initMedia();
      if (isUnmountedRef.current) {
        return;
      }

      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        try {
          await audioContextRef.current.resume();
        } catch (error) {
          console.warn('[AudioRecorder] Failed to resume AudioContext', error);
        }
      }

      sampleBufferRef.current = null;
      lastSentChunkRef.current = null;
      isRecordingRef.current = true;
      setStatus('recording');
    } catch (error) {
      let message = 'マイクの初期化に失敗しました';
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          message = 'マイクの使用が許可されていません。ブラウザの設定を確認してください。';
        } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
          message = 'マイクが見つかりません。接続を確認してください。';
        } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
          message = 'マイクにアクセスできません。他のアプリがマイクを使用している可能性があります。';
        } else if (error.name === 'OverConstrainedError' || error.name === 'ConstraintNotSatisfiedError') {
          message = '要求されたマイク設定に対応していません。';
        } else {
          message = `マイクエラー: ${error.message}`;
        }
      }
      reportError(message, error);
    }
  }, [initMedia, reportError, status, waitUntilWebSocketOpen, wsClient]);

  const stopRecording = useCallback(() => {
    if (isRecordingRef.current) {
      isRecordingRef.current = false;
      processBufferedSamples(true);
    }
    cleanupMedia();
  }, [cleanupMedia, processBufferedSamples]);

  // 録音状態の変化を監視
  useEffect(() => {
    if (isRecording) {
      startRecording();
    } else {
      stopRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  // コンポーネントのクリーンアップ
  useEffect(() => {
    return () => {
      isUnmountedRef.current = true;
      cleanupMedia();
    };
  }, [cleanupMedia]);

  return (
    <div className="flex flex-col gap-2">
      <StatusBadge status={status} permission={permission} deviceLabel={deviceLabel} />
      {permission === 'denied' && (
        <p className="text-xs text-red-600">
          ブラウザのマイク権限を許可した後、ページを再読み込みしてください。
        </p>
      )}
    </div>
  );
}


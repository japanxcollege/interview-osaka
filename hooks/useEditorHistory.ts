
import { useState, useCallback } from 'react';

interface HistoryState<T> {
    past: T[];
    present: T;
    future: T[];
}

export interface Snapshot<T> {
    id: string;
    name: string;
    timestamp: string;
    data: T;
}

export function useEditorHistory<T>(initialState: T, maxHistory = 50) {
    const [history, setHistory] = useState<HistoryState<T>>({
        past: [],
        present: initialState,
        future: [],
    });

    const [snapshots, setSnapshots] = useState<Snapshot<T>[]>([]);

    // Function to push new state
    const setContent = useCallback((newState: T) => {
        setHistory((curr) => {
            // If new state is same as present, ignore
            if (curr.present === newState) return curr;

            const newPast = [...curr.past, curr.present];
            if (newPast.length > maxHistory) {
                newPast.shift(); // Remove oldest
            }

            return {
                past: newPast,
                present: newState,
                future: [], // Clear future on new change
            };
        });
    }, [maxHistory]);

    // Undo
    const undo = useCallback(() => {
        setHistory((curr) => {
            if (curr.past.length === 0) return curr;

            const previous = curr.past[curr.past.length - 1];
            const newPast = curr.past.slice(0, curr.past.length - 1);

            return {
                past: newPast,
                present: previous,
                future: [curr.present, ...curr.future],
            };
        });
    }, []);

    // Redo
    const redo = useCallback(() => {
        setHistory((curr) => {
            if (curr.future.length === 0) return curr;

            const next = curr.future[0];
            const newFuture = curr.future.slice(1);

            return {
                past: [...curr.past, curr.present],
                present: next,
                future: newFuture,
            };
        });
    }, []);

    // Snapshot
    const saveSnapshot = useCallback((name: string) => {
        setSnapshots((prev) => [
            ...prev,
            {
                id: crypto.randomUUID(),
                name,
                timestamp: new Date().toISOString(),
                data: history.present,
            },
        ]);
    }, [history.present]);

    const loadSnapshot = useCallback((snapshotId: string) => {
        const snap = snapshots.find((s) => s.id === snapshotId);
        if (!snap) return;
        setContent(snap.data);
    }, [snapshots, setContent]);

    const canUndo = history.past.length > 0;
    const canRedo = history.future.length > 0;

    return {
        content: history.present,
        setContent,
        undo,
        redo,
        canUndo,
        canRedo,
        saveSnapshot,
        loadSnapshot,
        snapshots,
    };
}

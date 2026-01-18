'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { InterviewSession } from '@/types';
import ReactMarkdown from 'react-markdown';

export default function ExportPage() {
    const params = useParams();
    const sessionId = params.sessionId as string;
    const router = useRouter();
    const [session, setSession] = useState<InterviewSession | null>(null);

    useEffect(() => {
        const fetchSession = async () => {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8005';
            const res = await fetch(`${apiUrl}/api/sessions/${sessionId}`);
            if (res.ok) {
                setSession(await res.json());
            }
        };
        fetchSession();
    }, [sessionId]);

    if (!session) return <div className="p-8 text-white">Loading...</div>;

    const facts = session.draft_content?.facts_md || "";
    const feelings = session.draft_content?.feelings_md || "";

    const fullMarkdown = `# ${session.title}

## 時間軸: ${session.axes_selected?.join(', ')}

### 事実ログ
${facts}

### 感情・判断
${feelings}
`;

    const copyToClipboard = () => {
        navigator.clipboard.writeText(fullMarkdown);
        alert("Copied to clipboard!");
    };

    return (
        <div className="min-h-screen bg-neutral-950 text-white p-8 flex flex-col items-center">
            <div className="max-w-3xl w-full">
                <div className="flex justify-between items-center mb-8 border-b border-neutral-800 pb-4">
                    <h1 className="text-2xl font-bold">Export / Publish</h1>
                    <div className="flex gap-4">
                        <button onClick={() => router.back()} className="text-neutral-400 hover:text-white">Back to Edit</button>
                        <button
                            onClick={copyToClipboard}
                            className="bg-white text-black px-4 py-2 rounded-lg font-bold hover:bg-neutral-200"
                        >
                            Copy Markdown
                        </button>
                    </div>
                </div>

                <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-8 prose prose-invert max-w-none">
                    <ReactMarkdown>{fullMarkdown}</ReactMarkdown>
                </div>

                <div className="mt-8 bg-black p-4 rounded-lg border border-neutral-800 font-mono text-sm text-neutral-400 overflow-x-auto">
                    <pre>{fullMarkdown}</pre>
                </div>
            </div>
        </div>
    );
}

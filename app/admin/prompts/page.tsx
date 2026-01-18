
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface PromptStyle {
    id: string;
    name: string;
    description: string;
    instruction: string;
}

export default function AdminPromptsPage() {
    const [styles, setStyles] = useState<PromptStyle[]>([]);
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState<PromptStyle>({ id: '', name: '', description: '', instruction: '' });

    const fetchStyles = async () => {
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8005';
            const res = await fetch(`${apiUrl}/api/styles`);
            if (res.ok) {
                const data = await res.json();
                setStyles(data);
            }
        } catch (e) {
            console.error("Failed to fetch styles", e);
        }
    };

    useEffect(() => {
        fetchStyles();
    }, []);

    const handleEdit = (style: PromptStyle) => {
        setFormData(style);
        setIsEditing(true);
    };

    const handleCreate = () => {
        setFormData({ id: '', name: '', description: '', instruction: '' });
        setIsEditing(true);
    };

    const handleCancel = () => {
        setIsEditing(false);
        setFormData({ id: '', name: '', description: '', instruction: '' });
    };

    const handleDelete = async (id: string) => {
        if (!confirm('本当に削除しますか？')) return;
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8005';
            const res = await fetch(`${apiUrl}/api/styles/${encodeURIComponent(id)}`, { method: 'DELETE' });

            if (!res.ok) {
                const text = await res.text();
                throw new Error(`Delete failed: ${res.status} ${text}`);
            }

            await fetchStyles();
        } catch (e) {
            console.error(e);
            alert(`削除に失敗しました: ${e}`);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8005';

            // Check if update or create
            const exists = styles.some(s => s.id === formData.id);
            // Wait, if editing existing ID, it's an update. 
            // BUT ID is editable? Usually ID should be fixed for update, or check backend implementation.
            // Backend `add_style` raises error if exists. `update_style` updates by ID.
            // UI logic: If editing, we assume ID is locked or we track "original ID".
            // Since ID is the key, let's assume CREATE handles new ID, EDIT locks ID.

            // Actually, my backend update logic is `update_style(style_id, updates)`.
            // So if I am editing, I should know which ID I am editing.

            // Let's rely on `some(s => s.id === formData.id)` logic for "Create Mode" vs "Update Mode" is weak if ID is editable.
            // Better: Check if `styles` has it? No, user might type existing ID.
            // Let's assume: If "Edit" button clicked, ID is READONLY.

            if (isEditing && styles.some(s => s.id === formData.id)) {
                // Update
                await fetch(`${apiUrl}/api/styles/${formData.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData)
                });
            } else {
                // Create
                await fetch(`${apiUrl}/api/styles`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData)
                });
            }
            setIsEditing(false);
            fetchStyles();
        } catch (e) {
            console.error(e);
            alert('保存失敗: IDが重複している可能性があります');
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-5xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-2xl font-bold text-gray-800">Prompt Styles Admin</h1>
                    <div className="space-x-4">
                        <Link href="/" className="text-blue-600 hover:underline">← Home</Link>
                        <button onClick={handleCreate} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
                            + Add New Style
                        </button>
                    </div>
                </div>

                {isEditing ? (
                    <div className="bg-white p-6 rounded-xl shadow-md">
                        <h2 className="text-xl font-bold mb-4">{styles.some(s => s.id === formData.id) ? 'Edit Style' : 'Create Style'}</h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700">ID (Unique)</label>
                                <input
                                    type="text"
                                    value={formData.id}
                                    onChange={e => setFormData({ ...formData, id: e.target.value })}
                                    disabled={styles.some(s => s.id === formData.id)} // Lock ID if exists (simple heuristic for this editing mode)
                                    className="w-full p-2 border rounded"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700">Name (Display)</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full p-2 border rounded"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700">Description (Short)</label>
                                <input
                                    type="text"
                                    value={formData.description}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                    className="w-full p-2 border rounded"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700">Prompt Instruction</label>
                                <textarea
                                    value={formData.instruction}
                                    onChange={e => setFormData({ ...formData, instruction: e.target.value })}
                                    className="w-full h-40 p-2 border rounded font-mono text-sm"
                                    required
                                />
                            </div>
                            <div className="flex justify-end gap-2">
                                <button type="button" onClick={handleCancel} className="px-4 py-2 text-gray-600">Cancel</button>
                                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">Save</button>
                            </div>
                        </form>
                    </div>
                ) : (
                    <div className="bg-white rounded-xl shadow overflow-hidden">
                        <table className="w-full text-left">
                            <thead className="bg-gray-100 border-b">
                                <tr>
                                    <th className="p-4 font-bold text-gray-600">ID</th>
                                    <th className="p-4 font-bold text-gray-600">Name</th>
                                    <th className="p-4 font-bold text-gray-600">Description</th>
                                    <th className="p-4 font-bold text-gray-600 w-1/3">Instruction (Preview)</th>
                                    <th className="p-4 font-bold text-gray-600 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {styles.map(style => (
                                    <tr key={style.id} className="border-b hover:bg-gray-50">
                                        <td className="p-4 font-mono text-sm text-blue-600">{style.id}</td>
                                        <td className="p-4 font-bold">{style.name}</td>
                                        <td className="p-4 text-gray-500 text-sm">{style.description}</td>
                                        <td className="p-4 text-gray-400 text-xs font-mono truncate max-w-xs" title={style.instruction}>
                                            {style.instruction}
                                        </td>
                                        <td className="p-4 text-right space-x-2">
                                            <button onClick={() => handleEdit(style)} className="text-blue-600 hover:text-blue-800">Edit</button>
                                            <button onClick={() => handleDelete(style.id)} className="text-red-500 hover:text-red-700">Delete</button>
                                        </td>
                                    </tr>
                                ))}
                                {styles.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="p-8 text-center text-gray-400">No styles found. Add one!</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

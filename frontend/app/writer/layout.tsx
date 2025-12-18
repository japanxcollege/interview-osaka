
import React from 'react';

export default function WriterLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-gray-100 font-sans">
            {/* Writer Mode specific header or wrapper could go here */}
            {children}
        </div>
    );
}
